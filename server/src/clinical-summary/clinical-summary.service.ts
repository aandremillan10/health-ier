import { Injectable } from '@nestjs/common';
import { recordAudit } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { serverMode } from '../config';
import { fail } from '../errors';
import type { ClinicalSummaryItem, Prisma } from '../generated/prisma/client';
import type { Principal } from '../mirror-contract';
import { invalid, object, revision, text, uuid } from '../validation';
import { summaryContent, summaryFields } from './clinical-summary.validation';
import type {
  SummaryFields,
  SummaryHistory,
  SummaryItem,
} from './clinical-summary.types';

function clinician(staff: Principal): boolean {
  return staff.role === 'doctor' || staff.role === 'dentist';
}
function authorize(staff: Principal, write = false): void {
  if (serverMode() !== 'EDGE')
    fail(403, 'EDGE_ONLY', 'Open the clinic server to use clinical summaries.');
  if (!clinician(staff) && (write || !staff.isHead))
    fail(
      403,
      'FORBIDDEN',
      'Clinical summaries are available to clinicians and clinic head oversight.',
    );
}
type AttributedItem = ClinicalSummaryItem & { author: { displayName: string } };
function itemDto(staff: Principal, item: AttributedItem): SummaryItem {
  return {
    id: item.id,
    patientId: item.patientId,
    authorId: item.authorId,
    authorName: item.author.displayName,
    content: summaryContent(item.content),
    source: item.source,
    notes: item.notes,
    status: item.status as SummaryItem['status'],
    revision: item.revision,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    canEdit: clinician(staff) && staff.id === item.authorId,
  };
}
@Injectable()
export class ClinicalSummaryService {
  constructor(private readonly db: DatabaseService) {}

  async read(
    staff: Principal,
    patientId: string,
  ): Promise<{ patientId: string; canCreate: boolean; items: SummaryItem[] }> {
    authorize(staff);
    await this.patient(this.db, patientId);
    const items = await this.db.clinicalSummaryItem.findMany({
      where: { patientId },
      include: { author: { select: { displayName: true } } },
      orderBy: [
        { status: 'asc' },
        { kind: 'asc' },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
    });
    return {
      patientId,
      canCreate: clinician(staff),
      items: items.map((item) => itemDto(staff, item)),
    };
  }

  async create(
    staff: Principal,
    patientId: string,
    input: unknown,
  ): Promise<SummaryItem> {
    authorize(staff, true);
    const fields = summaryFields(object(input, ['content', 'source', 'notes']));
    return this.db.$transaction(async (tx) => {
      await this.patient(tx, patientId);
      const item = await tx.clinicalSummaryItem.create({
        data: {
          patientId,
          authorId: staff.id,
          kind: fields.content.kind,
          ...fields,
          content: fields.content,
        },
        include: { author: { select: { displayName: true } } },
      });
      await this.snapshot(tx, item, staff.id, 'create', null);
      await recordAudit(tx, staff, {
        action: 'create',
        resourceType: 'clinical-summary',
        resourceId: item.id,
        patientId: item.patientId,
      });
      return itemDto(staff, item);
    });
  }

  async change(
    staff: Principal,
    id: string,
    input: unknown,
    action: 'update' | 'correct' | 'inactivate',
  ): Promise<SummaryItem> {
    authorize(staff, true);
    uuid(id);
    const body = object(
      input,
      action === 'inactivate'
        ? ['expectedRevision', 'reason']
        : ['expectedRevision', 'reason', 'content', 'source', 'notes'],
    );
    const wanted = revision(body.expectedRevision);
    const reason = text(body.reason, 'reason', true, 4000)!;
    const fields: SummaryFields | null =
      action === 'inactivate' ? null : summaryFields(body);
    return this.db.$transaction(async (tx) => {
      const original = await tx.clinicalSummaryItem.findUnique({
        where: { id },
      });
      if (!original)
        fail(
          404,
          'NOT_FOUND',
          'The summary item is unavailable. Reload the patient record.',
        );
      if (original.authorId !== staff.id)
        fail(
          403,
          'FORBIDDEN',
          'Only the original author can change this summary item.',
        );
      if (original.revision !== wanted) this.stale(original.revision);
      if (fields && fields.content.kind !== original.kind) invalid('kind');
      if (original.status === 'inactive' && action !== 'correct')
        fail(
          409,
          'LIFECYCLE_CONFLICT',
          'This item is inactive. Add a correction to amend its preserved content.',
        );
      const changed = await tx.clinicalSummaryItem.updateMany({
        where: { id, revision: wanted },
        data: {
          ...(fields ?? {}),
          ...(action === 'inactivate' ? { status: 'inactive' } : {}),
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        const latest = await tx.clinicalSummaryItem.findUniqueOrThrow({
          where: { id },
          select: { revision: true },
        });
        this.stale(latest.revision);
      }
      const item = await tx.clinicalSummaryItem.findUniqueOrThrow({
        where: { id },
        include: { author: { select: { displayName: true } } },
      });
      await this.snapshot(tx, item, staff.id, action, reason);
      await recordAudit(tx, staff, {
        action: action === 'correct' ? 'correction' : 'change',
        resourceType: 'clinical-summary',
        resourceId: item.id,
        patientId: item.patientId,
      });
      return itemDto(staff, item);
    });
  }

  async history(staff: Principal, id: string): Promise<SummaryHistory[]> {
    authorize(staff);
    const original = await this.db.clinicalSummaryItem.findUnique({
      where: { id: uuid(id) },
      select: { id: true },
    });
    if (!original)
      fail(
        404,
        'NOT_FOUND',
        'The summary item is unavailable. Reload the patient record.',
      );
    const history = await this.db.clinicalSummaryRevision.findMany({
      where: { itemId: id },
      include: { author: { select: { displayName: true } } },
      orderBy: { revision: 'desc' },
    });
    return history.map((event) => {
      const snapshot = object(event.snapshot, [
        'content',
        'source',
        'notes',
        'status',
      ]);
      return {
        id: event.id,
        itemId: event.itemId,
        authorId: event.authorId,
        authorName: event.author.displayName,
        revision: event.revision,
        action: event.action as SummaryHistory['action'],
        reason: event.reason,
        snapshot: {
          ...summaryFields(snapshot),
          status: snapshot.status as SummaryItem['status'],
        },
        createdAt: event.createdAt.toISOString(),
      };
    });
  }

  private async patient(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const patient = await tx.patient.findUnique({
      where: { id: uuid(id, 'patientId') },
      select: { id: true },
    });
    if (!patient)
      fail(
        404,
        'NOT_FOUND',
        'The patient record is unavailable. Return to the patient registry.',
      );
  }
  private stale(currentRevision: number): never {
    return fail(
      409,
      'STALE_REVISION',
      'This summary item changed. Reload the clinical summary before saving.',
      { currentRevision },
    );
  }
  private async snapshot(
    tx: Prisma.TransactionClient,
    item: ClinicalSummaryItem,
    authorId: string,
    action: SummaryHistory['action'],
    reason: string | null,
  ): Promise<void> {
    await tx.clinicalSummaryRevision.create({
      data: {
        itemId: item.id,
        authorId,
        revision: item.revision,
        action,
        reason,
        snapshot: {
          content: item.content,
          source: item.source,
          notes: item.notes,
          status: item.status,
        },
      },
    });
  }
}
