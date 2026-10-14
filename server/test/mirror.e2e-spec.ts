import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/database/database.service';
import { enqueue } from '../src/database/outbox';
import { snapshot, type MirrorEvent } from '../src/mirror-contract';
import { MirrorService } from '../src/mirror/mirror.service';
import type { Prisma } from '../src/generated/prisma/client';

const edgeUrl = process.env.MIRROR_TEST_EDGE_URL;
const cloudUrl = process.env.MIRROR_TEST_CLOUD_URL;
describe.skipIf(!edgeUrl || !cloudUrl)(
  'mirror live PostgreSQL invariants',
  () => {
    let edge: DatabaseService;
    let cloud: DatabaseService;
    let sender: MirrorService;
    let receiver: MirrorService;
    const clinic = 'synthetic-clinic';
    const makeEvent = (
      type: MirrorEvent['entityType'],
      record: { id: string; revision: number },
    ): MirrorEvent => ({
      eventId: randomUUID(),
      clinicId: clinic,
      schemaVersion: 1,
      entityType: type,
      entityId: record.id,
      revision: record.revision,
      operation: 'upsert',
      payload: snapshot(type, record),
    });
    const deliver = async (
      events: MirrorEvent[],
    ): Promise<{ acknowledged: { eventId: string; revision: number }[] }> => {
      const acknowledged: { eventId: string; revision: number }[] = [];
      for (const event of events) {
        try {
          await receiver.apply(event);
          acknowledged.push({
            eventId: event.eventId,
            revision: event.revision,
          });
        } catch {
          /* Dependencies remain pending. */
        }
      }
      return { acknowledged };
    };
    const flush = async (): Promise<void> => {
      for (let n = 0; n < 30 && (await sender.status()).pending; n++)
        await sender.deliver(deliver);
      expect((await sender.status()).pending).toBe(0);
    };
    const createPatient = async (): Promise<{ id: string; revision: number }> =>
      edge.$transaction(async (tx) => {
        const row = await tx.patient.create({
          data: { fullName: 'Synthetic Mirror Patient' },
        });
        await enqueue(tx, 'patient', row);
        return row;
      });
    beforeAll(() => {
      process.env.SERVER_MODE = 'EDGE';
      process.env.CLINIC_ID = clinic;
      process.env.DATABASE_URL = edgeUrl;
      edge = new DatabaseService();
      sender = new MirrorService(edge);
      process.env.DATABASE_URL = cloudUrl;
      cloud = new DatabaseService();
      receiver = new MirrorService(cloud);
    });
    afterAll(async () => {
      await edge.$disconnect();
      await cloud.$disconnect();
    });

    it('rolls back domain/outbox together and database forbids later payload mutation', async () => {
      const id = randomUUID();
      await expect(
        edge.$transaction(async (tx) => {
          const patient = await tx.patient.create({
            data: { id, fullName: 'Synthetic Rolled Back' },
          });
          await enqueue(tx, 'patient', patient);
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      expect(await edge.patient.findUnique({ where: { id } })).toBeNull();
      expect(await edge.outbox.count({ where: { entityId: id } })).toBe(0);
      const patient = await createPatient();
      const row = await edge.outbox.findFirstOrThrow({
        where: { entityId: patient.id },
      });
      await expect(
        edge.outbox.update({
          where: { eventId: row.eventId },
          data: { payload: { forbidden: true } },
        }),
      ).rejects.toThrow();
      await flush();
    });

    it('lost ACK replay and process restart retain pending exact event; receipt/apply commit atomically', async () => {
      const patient = await createPatient();
      await sender.deliver(async (events) => {
        await deliver(events);
        throw new Error('lost acknowledgment');
      });
      expect(
        await edge.outbox.count({
          where: { entityId: patient.id, acknowledgedAt: null },
        }),
      ).toBe(1);
      sender = new MirrorService(edge);
      await flush();
      expect(
        await cloud.mirrorReceipt.count({ where: { entityId: patient.id } }),
      ).toBe(1);
      const row = await edge.patient.findUniqueOrThrow({
        where: { id: patient.id },
      });
      const event = makeEvent('patient', { ...row, revision: 2 });
      await cloud.$executeRawUnsafe(
        "CREATE FUNCTION mirror_test_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'controlled receipt rollback'; END $$",
      );
      await cloud.$executeRawUnsafe(
        'CREATE TRIGGER mirror_test_receipt BEFORE INSERT ON "MirrorReceipt" FOR EACH ROW EXECUTE FUNCTION mirror_test_fail_receipt()',
      );
      await expect(receiver.apply(event)).rejects.toThrow();
      expect(
        await cloud.mirrorVersion.count({
          where: { entityId: patient.id, revision: 2 },
        }),
      ).toBe(0);
      expect(
        (
          await cloud.mirrorEntity.findFirstOrThrow({
            where: { entityId: patient.id },
          })
        ).revision,
      ).toBe(1);
      await cloud.$executeRawUnsafe(
        'DROP TRIGGER mirror_test_receipt ON "MirrorReceipt"',
      );
      await cloud.$executeRawUnsafe('DROP FUNCTION mirror_test_fail_receipt()');
    });

    it('selects a late commit older than an already acknowledged event and never advances a sequence cursor', async () => {
      let release = (): void => {};
      let staged = (): void => {};
      const hold = new Promise<void>((resolve) => {
        release = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        staged = resolve;
      });
      const early = randomUUID();
      const transaction = edge.$transaction(
        async (tx) => {
          const row = await tx.patient.create({
            data: { id: early, fullName: 'Synthetic Late Commit' },
          });
          await tx.outbox.create({
            data: {
              clinicId: clinic,
              entityType: 'patient',
              entityId: row.id,
              revision: 1,
              payload: snapshot('patient', row),
              createdAt: new Date('2020-01-01'),
            },
          });
          staged();
          await hold;
        },
        { timeout: 15000 },
      );
      await ready;
      const later = await createPatient();
      await sender.deliver(deliver);
      expect(
        await cloud.mirrorEntity.count({ where: { entityId: later.id } }),
      ).toBe(1);
      expect(
        await cloud.mirrorEntity.count({ where: { entityId: early } }),
      ).toBe(0);
      release();
      await transaction;
      await flush();
      expect(
        await cloud.mirrorEntity.count({ where: { entityId: early } }),
      ).toBe(1);
    });

    it('in-flight edit remains pending, wrong ACK clears nothing, and stale/equal/event conflicts preserve newest', async () => {
      const patient = await createPatient();
      let original: MirrorEvent | undefined;
      await sender.deliver(async (events) => {
        original = events.find((event) => event.entityId === patient.id);
        await edge.$transaction(async (tx) => {
          const updated = await tx.patient.update({
            where: { id: patient.id },
            data: { revision: 2, fullName: 'Synthetic Newer Name' },
          });
          await enqueue(tx, 'patient', updated);
        });
        return deliver(events);
      });
      expect(
        await edge.outbox.count({
          where: { entityId: patient.id, acknowledgedAt: null },
        }),
      ).toBe(1);
      await sender.deliver(async () => ({
        acknowledged: [{ eventId: randomUUID(), revision: 2 }],
      }));
      expect(
        await edge.outbox.count({
          where: { entityId: patient.id, acknowledgedAt: null },
        }),
      ).toBe(1);
      await flush();
      if (!original) throw new Error('missing original');
      await receiver.apply({ ...original, eventId: randomUUID() });
      const newer = await cloud.mirrorEntity.findFirstOrThrow({
        where: { entityId: patient.id },
      });
      expect(newer.revision).toBe(2);
      await expect(
        receiver.apply({
          ...original,
          payload: { ...original.payload, fullName: 'Conflict' },
        }),
      ).rejects.toThrow('EVENT_CONFLICT');
      await expect(
        receiver.apply({
          ...original,
          eventId: randomUUID(),
          revision: 2,
          payload: {
            ...original.payload,
            revision: 2,
            fullName: 'Equal Conflict',
          },
        }),
      ).rejects.toThrow('REVISION_CONFLICT');
    });

    it('dependencies recover fairly and finalized originals, corrections and source identity cannot be overwritten', async () => {
      const patient = await createPatient();
      const doctor = await edge.$transaction(async (tx) => {
        const staff = await tx.staff.create({
          data: {
            username: randomUUID(),
            passwordHash: 'local-only',
            displayName: 'Synthetic Mirror Doctor',
            role: 'doctor',
          },
        });
        await enqueue(tx, 'staff', staff);
        return staff;
      });
      const record = await edge.$transaction(async (tx) => {
        const row = await tx.entry.create({
          data: {
            patientId: patient.id,
            authorId: doctor.id,
            discipline: 'medical',
            consultationDate: '2026-10-14',
            status: 'finalized',
            revision: 2,
            findings: 'Preserved synthetic original',
          },
        });
        await enqueue(tx, 'entry', row);
        return row;
      });
      const child = makeEvent('entry', record);
      await expect(receiver.apply(child)).rejects.toThrow('MISSING_DEPENDENCY');
      expect(
        await cloud.mirrorReceipt.count({ where: { eventId: child.eventId } }),
      ).toBe(0);
      await flush();
      const correction = await edge.$transaction(async (tx) => {
        const original = await tx.entry.update({
          where: { id: record.id },
          data: { revision: 3 },
        });
        await enqueue(tx, 'entry', original);
        const row = await tx.correction.create({
          data: {
            originalType: 'entry',
            originalEntryId: record.id,
            authorId: doctor.id,
            reason: 'Synthetic correction',
            correctedContent: { findings: 'Synthetic correction content' },
            sourceRevision: 2,
          },
        });
        await enqueue(tx, 'correction', row);
        return row;
      });
      await flush();
      expect(
        await cloud.mirrorVersion.count({ where: { entityId: correction.id } }),
      ).toBe(1);
      expect(
        await cloud.mirrorVersion.count({ where: { entityId: record.id } }),
      ).toBe(2);
      await expect(
        receiver.apply({
          ...child,
          eventId: randomUUID(),
          revision: 4,
          payload: { ...child.payload, revision: 4, findings: 'Overwrite' },
        }),
      ).rejects.toThrow('IMMUTABLE_CONFLICT');
      await expect(
        receiver.apply({
          ...child,
          eventId: randomUUID(),
          revision: 4,
          payload: { ...child.payload, revision: 4, patientId: randomUUID() },
        }),
      ).rejects.toThrow();
      expect(
        (
          await cloud.mirrorEntity.findFirstOrThrow({
            where: { entityId: record.id },
          })
        ).revision,
      ).toBe(3);
    });

    it('byte-bounds valid Unicode document batches and keeps safe actionable rejection codes', async () => {
      const patient = await createPatient();
      await sender.deliver(async (events) => ({
        acknowledged: [],
        rejected: [{ eventId: events[0].eventId, code: 'MISSING_DEPENDENCY' }],
      }));
      expect((await sender.status()).lastError).toBe('MISSING_DEPENDENCY');
      await sender.deliver(async (events) => ({
        acknowledged: [],
        rejected: [
          { eventId: events[0].eventId, code: 'untrusted-secret-like-text' },
        ],
      }));
      expect((await sender.status()).lastError).toBe('INVALID_ACK');
      await flush();
      const doctor = await edge.$transaction(async (tx) => {
        const row = await tx.staff.create({
          data: {
            username: randomUUID(),
            passwordHash: 'local-only',
            displayName: 'Synthetic Batch Doctor',
            role: 'doctor',
          },
        });
        await enqueue(tx, 'staff', row);
        return row;
      });
      const unicode = '診'.repeat(4000);
      const entry = await edge.$transaction(async (tx) => {
        const row = await tx.entry.create({
          data: {
            patientId: patient.id,
            authorId: doctor.id,
            discipline: 'medical',
            consultationDate: '2026-10-14',
            status: 'finalized',
            reason: unicode,
            findings: unicode,
            clinicalImpression: unicode,
            plan: unicode,
          },
        });
        await enqueue(tx, 'entry', row);
        return row;
      });
      await flush();
      const documentIds: string[] = [];
      const patientRow = await edge.patient.findUniqueOrThrow({
        where: { id: patient.id },
      });
      for (let n = 0; n < 10; n++) {
        const document = await edge.$transaction(async (tx) => {
          const row = await tx.document.create({
            data: {
              kind: 'medical_certificate',
              patientId: patient.id,
              consultationId: entry.id,
              issuerId: doctor.id,
              issueDate: '2026-10-14',
              snapshot: {
                patient: {
                  id: patient.id,
                  fullName: patientRow.fullName,
                  sex: patientRow.sex,
                  address: patientRow.address,
                  age: null,
                  cs: null,
                },
                issuer: {
                  id: doctor.id,
                  displayName: doctor.displayName,
                  licenseText: doctor.licenseText,
                  ptrText: doctor.ptrText,
                },
                consultation: {
                  id: entry.id,
                  revision: entry.revision,
                  consultationDate: entry.consultationDate,
                  reason: entry.reason,
                  findings: entry.findings,
                  clinicalImpression: entry.clinicalImpression,
                  plan: entry.plan,
                },
                body: unicode,
                purpose: unicode,
                remarks: unicode,
                restriction: unicode,
                followUp: unicode,
              },
            },
          });
          await enqueue(tx, 'document', row);
          return row;
        });
        documentIds.push(document.id);
      }
      const batchCounts: number[] = [];
      for (let n = 0; n < 10 && (await sender.status()).pending; n++)
        await sender.deliver(async (events) => {
          expect(
            Buffer.byteLength(
              JSON.stringify({ clinicId: clinic, events }),
              'utf8',
            ),
          ).toBeLessThanOrEqual(512 * 1024);
          batchCounts.push(events.length);
          return deliver(events);
        });
      expect(batchCounts.length).toBeGreaterThan(1);
      expect(batchCounts.reduce((sum, count) => sum + count, 0)).toBe(10);
      expect(
        await cloud.mirrorReceipt.count({
          where: { entityId: { in: documentIds } },
        }),
      ).toBe(10);
      expect((await sender.status()).pending).toBe(0);
    });

    it('bootstrap replays exact retained source history into empty CLOUD and concurrent writes remain catch-up', async () => {
      await cloud.mirrorReceipt.deleteMany();
      await cloud.mirrorVersion.deleteMany();
      await cloud.mirrorEntity.deleteMany();
      const originalTransaction = edge.$transaction.bind(edge);
      let snapshotRead = (): void => {};
      let finishSnapshot = (): void => {};
      const ready = new Promise<void>((resolve) => {
        snapshotRead = resolve;
      });
      const release = new Promise<void>((resolve) => {
        finishSnapshot = resolve;
      });
      // Intercept only the first snapshot read to force a genuine concurrent database commit.
      const intercepted = new Proxy(edge, {
        get(target, key, receiverObject): unknown {
          if (key !== '$transaction')
            return Reflect.get(target, key, receiverObject) as unknown;
          return (
            callback: (tx: Prisma.TransactionClient) => Promise<void>,
            options: { isolationLevel: 'RepeatableRead'; timeout: number },
          ): Promise<void> =>
            originalTransaction(async (tx) => {
              const proxy = new Proxy(tx, {
                get(inner, method, receiverTx): unknown {
                  if (method !== 'staff')
                    return Reflect.get(inner, method, receiverTx) as unknown;
                  return {
                    ...tx.staff,
                    findMany: async (): Promise<
                      Awaited<ReturnType<typeof tx.staff.findMany>>
                    > => {
                      const result = await tx.staff.findMany();
                      snapshotRead();
                      await release;
                      return result;
                    },
                  };
                },
              });
              return callback(proxy);
            }, options);
        },
      });
      const bootstrapService = new MirrorService(intercepted);
      const bootstrapping = bootstrapService.bootstrap();
      await ready;
      const concurrent = await createPatient();
      finishSnapshot();
      await bootstrapping;
      expect((await sender.status()).caughtUp).toBe(false);
      await flush();
      expect((await sender.status()).caughtUp).toBe(true);
      expect(
        await cloud.mirrorEntity.count({ where: { entityId: concurrent.id } }),
      ).toBe(1);
      expect(
        await cloud.mirrorVersion.count({
          where: { entityType: 'correction' },
        }),
      ).toBeGreaterThan(0);
      expect(await cloud.staff.count()).toBe(0);
      expect(await cloud.session.count()).toBe(0);
      const payloads = JSON.stringify(
        await cloud.mirrorVersion.findMany({ select: { payload: true } }),
      );
      expect(payloads).not.toContain('passwordHash');
      expect(payloads).not.toContain('local-only');
      expect(payloads).not.toContain('username');
    });
  },
);
