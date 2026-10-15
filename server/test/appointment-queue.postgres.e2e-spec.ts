import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppointmentsService } from '../src/appointments.service';
import { DatabaseService } from '../src/database/database.service';
import type { Principal } from '../src/mirror-contract';

const databaseUrl = process.env.QUEUE_TEST_DATABASE_URL;

// Only an explicitly supplied, disposable loopback database may run this suite.
describe.skipIf(!databaseUrl)('appointment numbers against PostgreSQL', () => {
  let db: DatabaseService;
  let appointments: AppointmentsService;
  let staff: Principal;
  let patientId: string;
  const site = `queue-test-${randomUUID()}`;
  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      !/^\/healthier_queue_test_[a-zA-Z0-9_]+$/.test(url.pathname)
    )
      throw new Error(
        'Use an owned disposable loopback healthier_queue_test_* database.',
      );
    vi.stubEnv('DATABASE_URL', databaseUrl!);
    vi.stubEnv('CLINIC_ID', site);
    vi.stubEnv('SERVER_MODE', 'EDGE');
    db = new DatabaseService();
    appointments = new AppointmentsService(db);
    const actor = await db.staff.create({
      data: {
        username: `queue-${randomUUID()}`,
        passwordHash: 'synthetic-unused',
        displayName: 'Synthetic queue clerk',
        role: 'clerk',
      },
    });
    staff = {
      id: actor.id,
      role: 'clerk',
      displayName: actor.displayName,
      isHead: false,
    };
    patientId = (
      await db.patient.create({ data: { fullName: 'Synthetic queue patient' } })
    ).id;
  });
  afterAll(async () => {
    await db?.$disconnect();
    vi.unstubAllEnvs();
  });

  it('serializes simultaneous allocations, resets by department/day/site, and preserves numbers through corrections', async () => {
    const create = (
      discipline = 'medical',
      scheduledAt = '2026-10-15T08:00:00+08:00',
    ): ReturnType<AppointmentsService['create']> =>
      appointments.create(staff, { patientId, discipline, scheduledAt });
    const records = await Promise.all(
      Array.from({ length: 16 }, () => create()),
    );
    expect(records.map((row) => row.queueNumber).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
    expect(records.every((row) => !Object.hasOwn(row, 'queueDay'))).toBe(true);
    expect((await create('dental')).queueNumber).toBe(1);
    expect((await create('laboratory')).queueNumber).toBe(1);
    expect(
      (await create('medical', '2026-10-16T00:00:00+08:00')).queueNumber,
    ).toBe(1);
    expect(
      (await create('medical', '2026-10-15T23:59:59.999+08:00')).queueNumber,
    ).toBe(17);
    vi.stubEnv('CLINIC_ID', `${site}-other`);
    expect((await create()).queueNumber).toBe(1);
    vi.stubEnv('CLINIC_ID', site);
    const record = records[0];
    const arrived = await appointments.change(staff, record.id, {
      expectedRevision: 1,
      status: 'arrived',
    });
    const waiting = await appointments.change(staff, record.id, {
      expectedRevision: 2,
      status: 'waiting',
    });
    const corrected = await appointments.change(
      staff,
      record.id,
      {
        expectedRevision: 3,
        status: 'arrived',
        reason: 'Synthetic correction',
      },
      true,
    );
    expect([
      arrived.queueNumber,
      waiting.queueNumber,
      corrected.queueNumber,
    ]).toEqual([record.queueNumber, record.queueNumber, record.queueNumber]);
    const list = await appointments.list(staff, {
      date: '2026-10-15',
      discipline: 'medical',
    });
    expect(list.find((row) => row.id === record.id)?.queueNumber).toBe(
      record.queueNumber,
    );
    expect((await create()).queueNumber).toBe(18);
  }, 30000);

  it('enforces positive/unique numbers and exact Manila queue days in PostgreSQL', async () => {
    const records = await db.appointment.findMany({
      where: { clinicId: site, discipline: 'medical', queueDay: '2026-10-15' },
      orderBy: { queueNumber: 'asc' },
    });
    const [first, second] = records;
    await expect(
      db.$executeRaw`UPDATE "Appointment" SET "queueNumber" = 0 WHERE "id" = ${first.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE "Appointment" SET "queueNumber" = ${second.queueNumber} WHERE "id" = ${first.id}::uuid`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE "Appointment" SET "queueDay" = '2026-10-16' WHERE "id" = ${first.id}::uuid`,
    ).rejects.toThrow();
    expect(
      (await db.appointment.findUniqueOrThrow({ where: { id: first.id } }))
        .queueNumber,
    ).toBe(first.queueNumber);
  });
});
