import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { ExecutionContext } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { expect, it } from 'vitest';
import { StaffGuard } from '../src/auth';
import { DatabaseService } from '../src/database/database.service';
import { configureHttp } from '../src/http';
import { LaboratoryController } from '../src/laboratory/laboratory.controller';
import { LaboratoryService } from '../src/laboratory/laboratory.service';

// HTTP fixture: exercises routes and domain rules; PostgreSQL locks and persistence need live verification.
type Row = Record<string, unknown>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (typeof value === 'object' && value !== null && 'in' in value)
      return (value.in as unknown[]).includes(row[key]);
    return row[key] === value;
  });
}
function table(seed: Row[] = []): {
  findUnique: (input: { where: Row }) => Promise<Row | null>;
  findMany: (input: { where?: Row }) => Promise<Row[]>;
  create: (input: { data: Row }) => Promise<Row>;
  update: (input: { where: Row; data: Row }) => Promise<Row>;
} {
  const records = seed;
  return {
    findUnique: async ({ where }) =>
      records.find((row) => matches(row, where)) ?? null,
    findMany: async ({ where = {} }) =>
      records.filter((row) => matches(row, where)),
    create: async ({ data }): Promise<Row> => {
      const row = {
        id: randomUUID(),
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      records.push(row);
      return row;
    },
    update: async ({ where, data }): Promise<Row> => {
      const row = records.find((entry) => matches(entry, where))!;
      for (const [key, value] of Object.entries(data)) {
        row[key] =
          typeof value === 'object' && value !== null && 'increment' in value
            ? Number(row[key]) + Number(value.increment)
            : value;
      }
      row.updatedAt = new Date();
      return row;
    },
  };
}

it('provider order → owned medtech result → preserved correction → origin provider review through HTTP', async () => {
  const doctor = {
    id: randomUUID(),
    displayName: 'Synthetic doctor',
    role: 'doctor',
    isHead: false,
  };
  const medtech = {
    id: randomUUID(),
    displayName: 'Synthetic medtech',
    role: 'medtech',
    isHead: false,
  };
  const otherMedtech = {
    id: randomUUID(),
    displayName: 'Other medtech',
    role: 'medtech',
    isHead: false,
  };
  const otherDoctor = {
    id: randomUUID(),
    displayName: 'Other doctor',
    role: 'doctor',
    isHead: false,
  };
  const clerk = {
    id: randomUUID(),
    displayName: 'Synthetic clerk',
    role: 'clerk',
    isHead: false,
  };
  const patient = {
    id: randomUUID(),
    revision: 1,
    fullName: 'Synthetic laboratory patient',
    sex: 'female',
    dateOfBirth: '1990-01-01',
    address: 'Private registry data',
  };
  const staff = { doctor, medtech, otherMedtech, otherDoctor, clerk };
  const db = {
    staff: table(Object.values(staff)),
    patient: table([patient]),
    labOrder: table(),
    labResult: table(),
    auditEvent: table(),
    $queryRaw: async (): Promise<[]> => [],
    $transaction: async <T>(
      operation: (tx: unknown) => Promise<T>,
    ): Promise<T> => operation(db),
  };
  const module = await Test.createTestingModule({
    controllers: [LaboratoryController],
    providers: [LaboratoryService, { provide: DatabaseService, useValue: db }],
  })
    .overrideGuard(StaffGuard)
    .useValue({
      canActivate: (context: ExecutionContext): boolean => {
        const req = context
          .switchToHttp()
          .getRequest<{ headers: Record<string, string>; staff: unknown }>();
        req.staff =
          staff[req.headers['x-test-staff'] as keyof typeof staff] ?? clerk;
        return true;
      },
    })
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureHttp(app);
  await app.init();
  const http = app.getHttpServer();
  try {
    const input = {
      requestedTests: ['Complete blood count'],
      clinicalContext: 'Check anemia',
      priority: 'routine',
      requestedFor: '2026-10-15',
    };
    const created = await request(http)
      .post(`/patients/${patient.id}/lab-orders`)
      .set('x-test-staff', 'doctor')
      .send(input)
      .expect(201);
    const orderId = created.body.id as string;
    await request(http)
      .get('/laboratory/queue')
      .set('x-test-staff', 'clerk')
      .expect(403);
    await request(http)
      .post(`/patients/${randomUUID()}/lab-orders`)
      .set('x-test-staff', 'doctor')
      .send(input)
      .expect(404);
    const queue = await request(http)
      .get('/laboratory/queue')
      .set('x-test-staff', 'medtech')
      .expect(200);
    expect(queue.body[0].patient.address).toBeUndefined();
    expect(queue.body[0].clinicalContext).toBe('Check anemia');
    await request(http)
      .post(`/lab-orders/${orderId}/start`)
      .set('x-test-staff', 'medtech')
      .send({ expectedRevision: 1 })
      .expect(201);
    const values = [
      {
        test: 'Hemoglobin',
        value: '13.2',
        unit: 'g/dL',
        referenceRange: '12–16',
        flag: 'normal',
      },
    ];
    const saved = await request(http)
      .post(`/lab-orders/${orderId}/result`)
      .set('x-test-staff', 'medtech')
      .send({ expectedRevision: 2, values, notes: null })
      .expect(201);
    const resultId = saved.body.results[0].id as string;
    const providerDraft = await request(http)
      .get(`/patients/${patient.id}/lab-orders`)
      .set('x-test-staff', 'doctor')
      .expect(200);
    expect(providerDraft.body[0].results).toEqual([]);
    await request(http)
      .post(`/lab-results/${resultId}/finalize`)
      .set('x-test-staff', 'otherMedtech')
      .send({ expectedRevision: 1, expectedOrderRevision: 3 })
      .expect(403);
    await request(http)
      .post(`/lab-results/${resultId}/finalize`)
      .set('x-test-staff', 'medtech')
      .send({ expectedRevision: 1, expectedOrderRevision: 2 })
      .expect(409);
    await request(http)
      .post(`/lab-results/${resultId}/finalize`)
      .set('x-test-staff', 'medtech')
      .send({ expectedRevision: 1, expectedOrderRevision: 3 })
      .expect(201);
    await request(http)
      .post(`/lab-orders/${orderId}/result`)
      .set('x-test-staff', 'medtech')
      .send({ expectedRevision: 4, values, notes: null })
      .expect(409);
    await request(http)
      .post(`/lab-orders/${orderId}/review`)
      .set('x-test-staff', 'otherDoctor')
      .send({ expectedRevision: 4 })
      .expect(403);
    await request(http)
      .post(`/lab-orders/${orderId}/review`)
      .set('x-test-staff', 'doctor')
      .send({ expectedRevision: 4 })
      .expect(201);
    const corrected = await request(http)
      .post(`/lab-results/${resultId}/corrections`)
      .set('x-test-staff', 'medtech')
      .send({
        expectedRevision: 2,
        expectedOrderRevision: 5,
        reason: 'Instrument correction',
        values: [{ ...values[0], value: '12.8' }],
        notes: null,
      })
      .expect(201);
    expect(corrected.body.status).toBe('resulted');
    expect(corrected.body.results).toHaveLength(2);
    expect(
      corrected.body.results.find((row: Row) => row.id === resultId).values[0]
        .value,
    ).toBe('13.2');
    expect(
      corrected.body.results.find((row: Row) => row.id !== resultId)
        .correctionOfId,
    ).toBe(resultId);
    await request(http)
      .post(`/lab-orders/${orderId}/review`)
      .set('x-test-staff', 'doctor')
      .send({ expectedRevision: 6 })
      .expect(201);
    const cancelled = await request(http)
      .post(`/patients/${patient.id}/lab-orders`)
      .set('x-test-staff', 'doctor')
      .send(input)
      .expect(201);
    await request(http)
      .post(`/lab-orders/${cancelled.body.id as string}/cancel`)
      .set('x-test-staff', 'doctor')
      .send({ expectedRevision: 1, reason: 'No longer needed' })
      .expect(201);
    await request(http)
      .post(`/lab-orders/${cancelled.body.id as string}/start`)
      .set('x-test-staff', 'medtech')
      .send({ expectedRevision: 2 })
      .expect(409);
    const rejected = await request(http)
      .post(`/patients/${patient.id}/lab-orders`)
      .set('x-test-staff', 'doctor')
      .send(input)
      .expect(201);
    await request(http)
      .post(`/lab-orders/${rejected.body.id as string}/reject`)
      .set('x-test-staff', 'medtech')
      .send({ expectedRevision: 1, reason: 'Specimen not suitable' })
      .expect(201);
  } finally {
    await app.close();
  }
});
