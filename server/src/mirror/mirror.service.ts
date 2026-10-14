import { Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { clinicId, serverMode } from '../config';
import { DatabaseService } from '../database/database.service';
import type { Prisma } from '../generated/prisma/client';
import {
  snapshot,
  type EntityType,
  type MirrorEvent,
} from '../mirror-contract';
import {
  canonical,
  digest,
  inputJson,
  MirrorFailure,
  object,
  parseBatch,
} from './validation';

export interface Acknowledgment {
  eventId: string;
  revision: number;
}
export interface MirrorResult {
  acknowledged: Acknowledgment[];
  rejected: { eventId: string; code: string }[];
}
@Injectable()
export class MirrorService {
  constructor(private readonly db: DatabaseService) {}

  authenticate(authorization: string | undefined): void {
    const expected = process.env.MIRROR_MACHINE_TOKEN;
    const supplied = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    const suppliedBytes = Buffer.from(supplied);
    const expectedBytes = Buffer.from(expected ?? '');
    if (
      !expected ||
      expected.length < 32 ||
      suppliedBytes.length !== expectedBytes.length ||
      !timingSafeEqual(suppliedBytes, expectedBytes)
    )
      throw new MirrorFailure('UNAUTHORIZED_MACHINE');
  }

  async ingest(input: unknown): Promise<MirrorResult> {
    if (serverMode() !== 'CLOUD') throw new MirrorFailure('WRONG_MODE');
    const events = parseBatch(input, clinicId());
    const result: MirrorResult = { acknowledged: [], rejected: [] };
    for (const event of events) {
      try {
        await this.apply(event);
        result.acknowledged.push({
          eventId: event.eventId,
          revision: event.revision,
        });
      } catch (error: unknown) {
        result.rejected.push({
          eventId: event.eventId,
          code:
            error instanceof MirrorFailure
              ? error.code
              : 'DATABASE_UNAVAILABLE',
        });
      }
    }
    return result;
  }

  async apply(event: MirrorEvent): Promise<void> {
    const eventHash = digest(event);
    const payloadHash = digest(event.payload);
    await this.db.$transaction(
      async (tx) => {
        // Serialize each clinic's receipt/revision checks without a process-local lock.
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${event.clinicId}))`;
        const receipt = await tx.mirrorReceipt.findUnique({
          where: {
            clinicId_eventId: {
              clinicId: event.clinicId,
              eventId: event.eventId,
            },
          },
        });
        if (receipt) {
          if (receipt.hash !== eventHash || receipt.revision !== event.revision)
            throw new MirrorFailure('EVENT_CONFLICT');
          return;
        }
        const key = {
          clinicId: event.clinicId,
          entityType: event.entityType,
          entityId: event.entityId,
        };
        const version = await tx.mirrorVersion.findUnique({
          where: {
            clinicId_entityType_entityId_revision: {
              ...key,
              revision: event.revision,
            },
          },
        });
        if (version && version.hash !== payloadHash)
          throw new MirrorFailure('REVISION_CONFLICT');
        await this.references(tx, event);
        const latest = await tx.mirrorEntity.findUnique({
          where: { clinicId_entityType_entityId: key },
        });
        if (latest) {
          const previous = object(latest.payload);
          for (const field of [
            'createdAt',
            'patientId',
            'authorId',
            'discipline',
            'originalEntryId',
            'originalType',
            'consultationId',
            'issuerId',
          ]) {
            if (
              Object.hasOwn(previous, field) &&
              previous[field] !== event.payload[field]
            )
              throw new MirrorFailure('IDENTITY_CONFLICT');
          }
          if (
            (event.entityType === 'document' ||
              event.entityType === 'correction') &&
            latest.hash !== payloadHash
          )
            throw new MirrorFailure('IMMUTABLE_CONFLICT');
          if (
            (event.entityType === 'entry' || event.entityType === 'vitals') &&
            previous.status === 'finalized' &&
            (event.revision > latest.revision ||
              event.payload.status === 'finalized')
          ) {
            const fixed = (payload: Record<string, unknown>): string =>
              canonical(
                Object.fromEntries(
                  Object.entries(payload).filter(
                    ([key]) => key !== 'revision' && key !== 'updatedAt',
                  ),
                ),
              );
            if (fixed(previous) !== fixed(object(event.payload)))
              throw new MirrorFailure('IMMUTABLE_CONFLICT');
          }
        }
        if (!version)
          await tx.mirrorVersion.create({
            data: {
              ...key,
              revision: event.revision,
              payload: event.payload,
              hash: payloadHash,
            },
          });
        if (!latest || event.revision > latest.revision)
          await tx.mirrorEntity.upsert({
            where: { clinicId_entityType_entityId: key },
            create: {
              ...key,
              revision: event.revision,
              payload: event.payload,
              hash: payloadHash,
            },
            update: {
              revision: event.revision,
              payload: event.payload,
              hash: payloadHash,
              updatedAt: new Date(),
            },
          });
        if (latest?.revision === event.revision && latest.hash !== payloadHash)
          throw new MirrorFailure('REVISION_CONFLICT');
        await tx.mirrorReceipt.create({
          data: {
            clinicId: event.clinicId,
            eventId: event.eventId,
            entityType: event.entityType,
            entityId: event.entityId,
            revision: event.revision,
            hash: eventHash,
          },
        });
      },
      { timeout: 10000 },
    );
  }

  private async references(
    tx: Prisma.TransactionClient,
    event: MirrorEvent,
  ): Promise<void> {
    const payload = object(event.payload);
    const parent = async (
      type: EntityType,
      id: unknown,
    ): Promise<Record<string, unknown>> => {
      if (typeof id !== 'string') throw new MirrorFailure('INVALID_REFERENCE');
      const record = await tx.mirrorEntity.findUnique({
        where: {
          clinicId_entityType_entityId: {
            clinicId: event.clinicId,
            entityType: type,
            entityId: id,
          },
        },
      });
      if (!record) throw new MirrorFailure('MISSING_DEPENDENCY');
      return object(record.payload);
    };
    if (event.entityType === 'staff' || event.entityType === 'patient') return;
    const author = await parent('staff', payload.authorId ?? payload.issuerId);
    if (event.entityType === 'correction') {
      const original = await parent(
        payload.originalType as 'vitals' | 'entry',
        payload.originalEntryId,
      );
      const originalVersion = await tx.mirrorVersion.findUnique({
        where: {
          clinicId_entityType_entityId_revision: {
            clinicId: event.clinicId,
            entityType: String(payload.originalType),
            entityId: String(payload.originalEntryId),
            revision: Number(payload.sourceRevision),
          },
        },
      });
      if (!originalVersion) throw new MirrorFailure('MISSING_DEPENDENCY');
      if (
        object(originalVersion.payload).status !== 'finalized' ||
        original.authorId !== payload.authorId
      )
        throw new MirrorFailure('INVALID_REFERENCE');
      const content = object(payload.correctedContent);
      const allowed =
        payload.originalType === 'vitals'
          ? [
              'recordedAt',
              'systolic',
              'diastolic',
              'temperature',
              'pulse',
              'respiratoryRate',
              'oxygenSaturation',
              'weight',
            ]
          : original.discipline === 'medical'
            ? [
                'consultationDate',
                'ageAtConsultation',
                'cs',
                'vitalsId',
                'reason',
                'findings',
                'clinicalImpression',
                'plan',
              ]
            : ['text'];
      if (Object.keys(content).some((key) => !allowed.includes(key)))
        throw new MirrorFailure('INVALID_REFERENCE');
      if (typeof content.vitalsId === 'string') {
        const vitals = await parent('vitals', content.vitalsId);
        if (
          vitals.status !== 'finalized' ||
          vitals.patientId !== original.patientId
        )
          throw new MirrorFailure('INVALID_REFERENCE');
      }
      return;
    }
    await parent('patient', payload.patientId);
    if (event.entityType === 'vitals' && author.role !== 'attendant')
      throw new MirrorFailure('INVALID_REFERENCE');
    if (event.entityType === 'entry') {
      const role = {
        medical: 'doctor',
        dental: 'dentist',
        laboratory: 'medtech',
      }[String(payload.discipline)];
      if (author.role !== role) throw new MirrorFailure('INVALID_REFERENCE');
      if (payload.vitalsId !== null) {
        const vitals = await parent('vitals', payload.vitalsId);
        if (
          vitals.status !== 'finalized' ||
          vitals.patientId !== payload.patientId
        )
          throw new MirrorFailure('INVALID_REFERENCE');
      }
    }
    if (event.entityType === 'document') {
      const consultation = await parent('entry', payload.consultationId);
      const document = object(payload.snapshot);
      const source = object(document.consultation);
      const sourceVersion = await tx.mirrorVersion.findUnique({
        where: {
          clinicId_entityType_entityId_revision: {
            clinicId: event.clinicId,
            entityType: 'entry',
            entityId: String(payload.consultationId),
            revision: Number(source.revision),
          },
        },
      });
      if (!sourceVersion) throw new MirrorFailure('MISSING_DEPENDENCY');
      const sourcePayload = object(sourceVersion.payload);
      const issuerSnapshot = object(document.issuer);
      const staffVersions = await tx.mirrorVersion.findMany({
        where: {
          clinicId: event.clinicId,
          entityType: 'staff',
          entityId: String(payload.issuerId),
        },
      });
      if (
        !staffVersions.some((version) =>
          ['id', 'displayName', 'licenseText', 'ptrText'].every(
            (key) => object(version.payload)[key] === issuerSnapshot[key],
          ),
        )
      )
        throw new MirrorFailure('INVALID_REFERENCE');
      const patientSnapshot = object(document.patient);
      const patientVersions = await tx.mirrorVersion.findMany({
        where: {
          clinicId: event.clinicId,
          entityType: 'patient',
          entityId: String(payload.patientId),
        },
      });
      if (
        !patientVersions.some((version) =>
          ['id', 'fullName', 'sex', 'address'].every(
            (key) => object(version.payload)[key] === patientSnapshot[key],
          ),
        )
      )
        throw new MirrorFailure('INVALID_REFERENCE');
      if (
        author.role !== 'doctor' ||
        consultation.status !== 'finalized' ||
        consultation.discipline !== 'medical' ||
        consultation.patientId !== payload.patientId ||
        consultation.authorId !== payload.issuerId ||
        sourcePayload.status !== 'finalized'
      )
        throw new MirrorFailure('INVALID_REFERENCE');
      for (const key of [
        'id',
        'revision',
        'consultationDate',
        'reason',
        'findings',
        'clinicalImpression',
        'plan',
      ])
        if (source[key] !== sourcePayload[key])
          throw new MirrorFailure('INVALID_REFERENCE');
    }
  }

  async bootstrap(): Promise<void> {
    if (serverMode() !== 'EDGE') throw new MirrorFailure('WRONG_MODE');
    await this.db.$transaction(
      async (tx) => {
        const records = [
          ['staff', await tx.staff.findMany()],
          ['patient', await tx.patient.findMany()],
          ['vitals', await tx.vitals.findMany()],
          ['entry', await tx.entry.findMany()],
          ['correction', await tx.correction.findMany()],
          ['document', await tx.document.findMany()],
        ] as const;
        for (const [entityType, rows] of records) {
          for (const record of rows)
            await tx.outbox.createMany({
              data: [
                {
                  clinicId: clinicId(),
                  entityType,
                  entityId: record.id,
                  revision: record.revision,
                  payload: snapshot(entityType, record),
                },
              ],
              skipDuplicates: true,
            });
        }
        // Retained transactional history supplies exact sources to a new empty CLOUD.
        await tx.outbox.updateMany({
          where: { clinicId: clinicId() },
          data: { acknowledgedAt: null, attempts: 0, lastError: null },
        });
        await tx.mirrorState.upsert({
          where: { clinicId: clinicId() },
          create: { clinicId: clinicId(), bootstrapCompletedAt: new Date() },
          update: { bootstrapCompletedAt: new Date() },
        });
      },
      { isolationLevel: 'RepeatableRead', timeout: 30000 },
    );
  }

  async status(): Promise<{
    mode: 'EDGE' | 'CLOUD';
    bootstrap: 'pending' | 'complete';
    pending: number;
    caughtUp: boolean;
    lastAcknowledgedAt: string | null;
    lastError: string | null;
  }> {
    const [state, pending] = await this.db.$transaction(
      [
        this.db.mirrorState.findUnique({ where: { clinicId: clinicId() } }),
        this.db.outbox.count({
          where: { clinicId: clinicId(), acknowledgedAt: null },
        }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      mode: serverMode(),
      bootstrap: state?.bootstrapCompletedAt ? 'complete' : 'pending',
      pending,
      caughtUp: Boolean(state?.bootstrapCompletedAt) && pending === 0,
      lastAcknowledgedAt: state?.lastAcknowledgedAt?.toISOString() ?? null,
      lastError: state?.lastError ?? null,
    };
  }

  async deliver(
    transport: (events: MirrorEvent[]) => Promise<unknown>,
  ): Promise<number> {
    if (serverMode() !== 'EDGE') throw new MirrorFailure('WRONG_MODE');
    const rows = await this.db.outbox.findMany({
      where: { clinicId: clinicId(), acknowledgedAt: null },
      orderBy: [{ attempts: 'asc' }, { createdAt: 'asc' }],
      take: 50,
    });
    if (!rows.length) return 0;
    const events = rows.map((row) => ({
      eventId: row.eventId,
      clinicId: row.clinicId,
      schemaVersion: row.schemaVersion,
      entityType: row.entityType,
      entityId: row.entityId,
      revision: row.revision,
      operation: row.operation,
      payload: inputJson(row.payload),
    }));
    const sent = parseBatch({ clinicId: clinicId(), events }, clinicId());
    try {
      const response = object(await transport(sent));
      if (!Array.isArray(response.acknowledged))
        throw new MirrorFailure('INVALID_ACK');
      const acknowledged: Acknowledgment[] = [];
      const seen = new Set<string>();
      for (const candidate of response.acknowledged) {
        const ack = object(candidate);
        if (
          Object.keys(ack).length !== 2 ||
          typeof ack.eventId !== 'string' ||
          seen.has(ack.eventId) ||
          !sent.some(
            (event) =>
              event.eventId === ack.eventId && event.revision === ack.revision,
          )
        )
          throw new MirrorFailure('INVALID_ACK');
        seen.add(ack.eventId);
        acknowledged.push({
          eventId: ack.eventId,
          revision: Number(ack.revision),
        });
      }
      const failures = new Map<string, string>();
      const safeCodes = [
        'MISSING_DEPENDENCY',
        'INVALID_REFERENCE',
        'EVENT_CONFLICT',
        'REVISION_CONFLICT',
        'IMMUTABLE_CONFLICT',
        'IDENTITY_CONFLICT',
        'DATABASE_UNAVAILABLE',
      ];
      if (response.rejected !== undefined) {
        if (!Array.isArray(response.rejected))
          throw new MirrorFailure('INVALID_ACK');
        for (const candidate of response.rejected) {
          const rejected = object(candidate);
          if (
            typeof rejected.eventId !== 'string' ||
            typeof rejected.code !== 'string' ||
            Object.keys(rejected).length !== 2 ||
            !safeCodes.includes(rejected.code) ||
            seen.has(rejected.eventId) ||
            failures.has(rejected.eventId) ||
            !sent.some((event) => event.eventId === rejected.eventId)
          )
            throw new MirrorFailure('INVALID_ACK');
          failures.set(rejected.eventId, rejected.code);
        }
      }
      const now = new Date();
      await this.db.$transaction(async (tx) => {
        for (const ack of acknowledged)
          await tx.outbox.updateMany({
            where: {
              eventId: ack.eventId,
              revision: ack.revision,
              clinicId: clinicId(),
              acknowledgedAt: null,
            },
            data: { acknowledgedAt: now, lastError: null },
          });
        const remaining = sent
          .filter((event) => !seen.has(event.eventId))
          .map((event) => event.eventId);
        for (const eventId of remaining)
          await tx.outbox.updateMany({
            where: { eventId, acknowledgedAt: null },
            data: {
              attempts: { increment: 1 },
              lastError: failures.get(eventId) ?? 'REMOTE_REJECTED',
            },
          });
        const lastError = remaining.length
          ? (failures.get(remaining[0]) ?? 'REMOTE_REJECTED')
          : null;
        await tx.mirrorState.upsert({
          where: { clinicId: clinicId() },
          create: {
            clinicId: clinicId(),
            lastAcknowledgedAt: acknowledged.length ? now : null,
            lastError,
          },
          update: {
            ...(acknowledged.length ? { lastAcknowledgedAt: now } : {}),
            lastError,
          },
        });
      });
      return acknowledged.length;
    } catch (error: unknown) {
      const code =
        error instanceof MirrorFailure ? error.code : 'DELIVERY_UNAVAILABLE';
      await this.db.$transaction([
        this.db.outbox.updateMany({
          where: {
            eventId: { in: sent.map((event) => event.eventId) },
            acknowledgedAt: null,
          },
          data: { attempts: { increment: 1 }, lastError: code },
        }),
        this.db.mirrorState.upsert({
          where: { clinicId: clinicId() },
          create: { clinicId: clinicId(), lastError: code },
          update: { lastError: code },
        }),
      ]);
      return 0;
    }
  }
}
