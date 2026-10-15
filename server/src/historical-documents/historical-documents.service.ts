import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { recordAudit } from '../audit/audit.service';
import { canRead } from '../clinic.service';
import { clinicId } from '../config';
import type { HistoricalDocument } from '../generated/prisma/client';
import type { Discipline, Principal } from '../mirror-contract';
import { fail } from '../errors';
import {
  dateOnly,
  discipline,
  invalid,
  object,
  text,
  uuid,
} from '../validation';
import { decodeHistoricalFile } from './file-validation';
import { HistoricalStorage } from './historical-storage';
import { enqueue } from '../database/outbox';

export function historicalMetadata(
  row: HistoricalDocument,
): Omit<HistoricalDocument, 'objectKey' | 'revision'> {
  const { objectKey: _objectKey, revision: _revision, ...metadata } = row;
  void _objectKey;
  void _revision;
  return metadata;
}

@Injectable()
export class HistoricalDocumentsService {
  private readonly logger = new Logger(HistoricalDocumentsService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: HistoricalStorage,
  ) {}
  private authorize(staff: Principal, area: Discipline, writing = false): void {
    const own =
      (staff.role === 'doctor' && area === 'medical') ||
      (staff.role === 'dentist' && area === 'dental') ||
      (staff.role === 'medtech' && area === 'laboratory');
    if (writing ? !own : !canRead(staff, area))
      fail(
        403,
        'FORBIDDEN',
        'Your account cannot access these historical records.',
      );
  }
  private async patient(id: string): Promise<void> {
    if (
      !(await this.db.patient.findUnique({
        where: { id: uuid(id, 'patientId') },
        select: { id: true },
      }))
    )
      fail(404, 'NOT_FOUND', 'Patient unavailable.');
  }
  async list(
    staff: Principal,
    patientId: string,
    query: unknown,
  ): Promise<{
    documents: ReturnType<typeof historicalMetadata>[];
    nextCursor: string | null;
  }> {
    const input = object(query, ['discipline', 'cursor']);
    const area =
      input.discipline === undefined
        ? undefined
        : discipline(text(input.discipline, 'discipline', true, 20)!);
    if (area) this.authorize(staff, area);
    const allowed = (['medical', 'dental', 'laboratory'] as const).filter(
      (value) => canRead(staff, value),
    );
    if (!allowed.length)
      fail(403, 'FORBIDDEN', 'Your account cannot access historical records.');
    await this.patient(patientId);
    const cursor = input.cursor ? uuid(input.cursor, 'cursor') : undefined;
    const rows = await this.db.historicalDocument.findMany({
      where: { patientId, discipline: area ?? { in: allowed } },
      take: 51,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return {
      documents: rows.slice(0, 50).map(historicalMetadata),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  }
  private async accessible(
    staff: Principal,
    patientId: string,
    id: string,
  ): Promise<HistoricalDocument> {
    if (!staff.isHead && !['doctor', 'dentist', 'medtech'].includes(staff.role))
      fail(403, 'FORBIDDEN', 'Your account cannot access historical records.');
    uuid(patientId, 'patientId');
    const row = await this.db.historicalDocument.findUnique({
      where: { id: uuid(id) },
    });
    if (!row || row.patientId !== patientId)
      fail(404, 'NOT_FOUND', 'Historical record unavailable.');
    this.authorize(staff, discipline(row.discipline));
    return row;
  }
  async read(
    staff: Principal,
    patientId: string,
    id: string,
  ): Promise<ReturnType<typeof historicalMetadata>> {
    return historicalMetadata(await this.accessible(staff, patientId, id));
  }
  async content(
    staff: Principal,
    patientId: string,
    id: string,
  ): Promise<{
    document: ReturnType<typeof historicalMetadata>;
    contentBase64: string;
  }> {
    const row = await this.accessible(staff, patientId, id);
    const bytes = await this.storage.get(row.objectKey);
    if (
      bytes.length !== row.byteLength ||
      createHash('sha256').update(bytes).digest('hex') !== row.sha256
    )
      fail(
        503,
        'UNAVAILABLE',
        'Historical file integrity could not be confirmed.',
      );
    return {
      document: historicalMetadata(row),
      contentBase64: bytes.toString('base64'),
    };
  }
  async import(
    staff: Principal,
    patientId: string,
    value: unknown,
  ): Promise<ReturnType<typeof historicalMetadata>> {
    const input = object(value, [
      'id',
      'discipline',
      'documentType',
      'documentDate',
      'description',
      'filename',
      'mimeType',
      'contentBase64',
      'replacesId',
      'replacementReason',
    ]);
    const area = discipline(text(input.discipline, 'discipline', true, 20)!);
    this.authorize(staff, area, true);
    await this.patient(patientId);
    const file = decodeHistoricalFile(input);
    const id = uuid(input.id);
    const replacesId =
      input.replacesId === undefined
        ? null
        : uuid(input.replacesId, 'replacesId');
    const replacementReason =
      input.replacementReason === undefined
        ? null
        : text(input.replacementReason, 'replacementReason', true, 2000);
    if (Boolean(replacesId) !== Boolean(replacementReason))
      invalid('replacementReason');
    const data = {
      id,
      patientId,
      discipline: area,
      documentType: text(input.documentType, 'documentType', true, 80)!,
      documentDate: dateOnly(input.documentDate, 'documentDate'),
      description: text(input.description, 'description', true, 2000)!,
      filename: file.filename,
      mimeType: file.mimeType,
      byteLength: file.bytes.length,
      sha256: file.sha256,
      objectKey: `${clinicId()}/historical/${id}/${file.sha256}/${randomUUID()}`,
      uploaderId: staff.id,
      uploaderName: staff.displayName,
      replacesId,
      replacementReason,
      revision: 1,
    };
    const matches = (row: HistoricalDocument): boolean =>
      Object.entries(data).every(
        ([key, field]) =>
          key === 'objectKey' || row[key as keyof HistoricalDocument] === field,
      );
    const prior = await this.db.historicalDocument.findUnique({
      where: { id },
    });
    if (prior) {
      if (!matches(prior))
        fail(
          409,
          'CONFLICT',
          'This import identity already belongs to a different record.',
        );
      return historicalMetadata(prior);
    }
    if (replacesId) {
      const original = await this.accessible(staff, patientId, replacesId);
      if (original.uploaderId !== staff.id)
        fail(
          403,
          'FORBIDDEN',
          'Only the uploader may replace this historical record.',
        );
      if (original.discipline !== area) invalid('replacesId');
      if (
        await this.db.historicalDocument.findUnique({ where: { replacesId } })
      )
        fail(
          409,
          'CONFLICT',
          'This historical record already has a replacement.',
        );
    }
    await this.storage.put(
      data.objectKey,
      file.bytes,
      file.mimeType,
      file.sha256,
    );
    try {
      const saved = await this.db.$transaction(async (tx) => {
        const row = await tx.historicalDocument.create({ data });
        await recordAudit(tx, staff, {
          action: 'import',
          resourceType: 'historical-document',
          resourceId: id,
          patientId,
        });
        await enqueue(tx, 'historicalDocument', row);
        return row;
      });
      return historicalMetadata(saved);
    } catch (error: unknown) {
      let committed: HistoricalDocument | null;
      try {
        committed = await this.db.historicalDocument.findUnique({
          where: { id },
        });
      } catch {
        this.logger.warn(
          `Attachment commit uncertain; retain object ${data.objectKey}`,
        );
        throw error;
      }
      if (committed && matches(committed)) {
        if (committed.objectKey !== data.objectKey) {
          try {
            await this.storage.remove(data.objectKey);
          } catch {
            this.logger.warn(
              `Unreferenced attachment retained for reconciliation ${data.objectKey}`,
            );
          }
        }
        return historicalMetadata(committed);
      }
      if (!committed || committed.objectKey !== data.objectKey) {
        try {
          await this.storage.remove(data.objectKey);
        } catch {
          this.logger.warn(
            `Unreferenced attachment retained for reconciliation ${data.objectKey}`,
          );
        }
      }
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      )
        fail(
          409,
          'CONFLICT',
          'The historical record changed. Refresh the list before trying again.',
        );
      throw error;
    }
  }
}
