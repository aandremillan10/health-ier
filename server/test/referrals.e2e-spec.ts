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
import { ReferralsController } from '../src/referrals/referrals.controller';
import { ReferralsService } from '../src/referrals/referrals.service';

// Public HTTP fixture. It does not establish PostgreSQL lock behavior or durable persistence.
type Row = Record<string, unknown>;
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR')
      return (value as Row[]).some((branch) => matches(row, branch));
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
  return {
    findUnique: async ({ where }): Promise<Row | null> =>
      seed.find((row) => matches(row, where)) ?? null,
    findMany: async ({ where = {} }): Promise<Row[]> =>
      seed.filter((row) => matches(row, where)),
    create: async ({ data }): Promise<Row> => {
      const row = {
        id: randomUUID(),
        revision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      seed.push(row);
      return row;
    },
    update: async ({ where, data }): Promise<Row> => {
      const row = seed.find((value) => matches(value, where))!;
      for (const [key, value] of Object.entries(data))
        row[key] =
          typeof value === 'object' && value !== null && 'increment' in value
            ? Number(row[key]) + Number(value.increment)
            : value;
      row.updatedAt = new Date();
      return row;
    },
  };
}

it('hands dental and laboratory work to the authorized receiver and preserves completed result references', async () => {
  const principal = (role: string, displayName: string): Row => ({
    id: randomUUID(),
    role,
    displayName,
    isHead: false,
  });
  const staff = {
    doctor: principal('doctor', 'Synthetic doctor'),
    dentist: principal('dentist', 'Synthetic dentist'),
    otherDentist: principal('dentist', 'Other dentist'),
    medtech: principal('medtech', 'Synthetic medtech'),
    clerk: principal('clerk', 'Synthetic clerk'),
  };
  const patient = {
    id: randomUUID(),
    revision: 1,
    fullName: 'Synthetic referral patient',
    sex: 'female',
    dateOfBirth: '1990-01-01',
    address: 'Unrelated registry data',
  };
  const otherPatient = {
    ...patient,
    id: randomUUID(),
    fullName: 'Other synthetic patient',
  };
  const db = {
    staff: table(Object.values(staff)),
    patient: table([patient, otherPatient]),
    referral: table(),
    labOrder: table(),
    labResult: table(),
    auditEvent: table(),
    $queryRaw: async (): Promise<[]> => [],
    $transaction: async <T>(
      operation: (tx: unknown) => Promise<T>,
    ): Promise<T> => operation(db),
  };
  const module = await Test.createTestingModule({
    controllers: [ReferralsController, LaboratoryController],
    providers: [
      ReferralsService,
      LaboratoryService,
      { provide: DatabaseService, useValue: db },
    ],
  })
    .overrideGuard(StaffGuard)
    .useValue({
      canActivate: (context: ExecutionContext): boolean => {
        const req = context
          .switchToHttp()
          .getRequest<{ headers: Record<string, string>; staff: unknown }>();
        req.staff =
          staff[req.headers['x-test-staff'] as keyof typeof staff] ??
          staff.clerk;
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
  const post = (
    who: keyof typeof staff,
    path: string,
    body: Row,
  ): request.Test =>
    request(http).post(path).set('x-test-staff', who).send(body);
  const get = (who: keyof typeof staff, path: string): request.Test =>
    request(http).get(path).set('x-test-staff', who);
  try {
    const input = {
      receivingDiscipline: 'dental',
      reason: 'Synthetic dental assessment',
      labOrderId: null,
    };
    await post('clerk', `/patients/${patient.id}/referrals`, input).expect(403);
    const created = await post(
      'doctor',
      `/patients/${patient.id}/referrals`,
      input,
    ).expect(201);
    const id = created.body.id as string;
    await post('medtech', `/referrals/${id}/accept`, {
      expectedRevision: 1,
    }).expect(404);
    const inbox = await get('dentist', '/referrals/inbox?scope=pending').expect(
      200,
    );
    expect(inbox.body[0].patient.address).toBeUndefined();
    expect(
      (await get('medtech', '/referrals/inbox?scope=pending').expect(200)).body,
    ).toEqual([]);
    await post('dentist', `/referrals/${id}/accept`, {
      expectedRevision: 1,
    }).expect(201);
    await post('otherDentist', `/referrals/${id}/start`, {
      expectedRevision: 2,
    }).expect(403);
    await post('dentist', `/referrals/${id}/start`, {
      expectedRevision: 1,
    }).expect(409);
    await post('dentist', `/referrals/${id}/start`, {
      expectedRevision: 2,
    }).expect(201);
    const completed = await post('dentist', `/referrals/${id}/complete`, {
      expectedRevision: 3,
      completionNote: 'Dental assessment complete',
      completionReference: 'Synthetic dental visit',
      labResultId: null,
    }).expect(201);
    expect(completed.body.completedById).toBe(staff.dentist.id);
    expect(completed.body.completedAt).toBeTruthy();
    await post('doctor', `/referrals/${id}/cancel`, {
      expectedRevision: 4,
      reason: 'Too late',
    }).expect(409);
    await post('dentist', `/referrals/${id}/complete`, {
      expectedRevision: 4,
      completionNote: 'Overwrite',
      completionReference: null,
      labResultId: null,
    }).expect(409);
    const sent = await get('doctor', '/referrals/sent?scope=all').expect(200);
    expect(sent.body[0].status).toBe('completed');
    const cancelled = await post(
      'doctor',
      `/patients/${patient.id}/referrals`,
      input,
    ).expect(201);
    await post('doctor', `/referrals/${cancelled.body.id as string}/cancel`, {
      expectedRevision: 1,
      reason: 'No longer needed',
    }).expect(201);
    await post('dentist', `/referrals/${cancelled.body.id as string}/accept`, {
      expectedRevision: 2,
    }).expect(409);
    const rejected = await post(
      'doctor',
      `/patients/${patient.id}/referrals`,
      input,
    ).expect(201);
    await post('dentist', `/referrals/${rejected.body.id as string}/reject`, {
      expectedRevision: 1,
      reason: 'Please clarify request',
    }).expect(201);
    const labInput = {
      requestedTests: ['Complete blood count'],
      clinicalContext: 'Synthetic anemia check',
      priority: 'routine',
      requestedFor: '2026-10-15',
    };
    let labOrder = (
      await post(
        'doctor',
        `/patients/${patient.id}/lab-orders`,
        labInput,
      ).expect(201)
    ).body;
    const foreignOrder = await post(
      'doctor',
      `/patients/${otherPatient.id}/lab-orders`,
      labInput,
    ).expect(201);
    await post('doctor', `/patients/${patient.id}/referrals`, {
      ...input,
      receivingDiscipline: 'laboratory',
      labOrderId: foreignOrder.body.id,
    }).expect(400);
    const labReferral = await post(
      'doctor',
      `/patients/${patient.id}/referrals`,
      { ...input, receivingDiscipline: 'laboratory', labOrderId: labOrder.id },
    ).expect(201);
    const labReferralId = labReferral.body.id as string;
    await post('medtech', `/referrals/${labReferralId}/accept`, {
      expectedRevision: 1,
    }).expect(201);
    await post('medtech', `/referrals/${labReferralId}/start`, {
      expectedRevision: 2,
    }).expect(201);
    await post('medtech', `/referrals/${labReferralId}/complete`, {
      expectedRevision: 3,
      completionNote: null,
      completionReference: null,
      labResultId: randomUUID(),
    }).expect(400);
    labOrder = (
      await post('medtech', `/lab-orders/${labOrder.id as string}/start`, {
        expectedRevision: 1,
      }).expect(201)
    ).body;
    labOrder = (
      await post('medtech', `/lab-orders/${labOrder.id as string}/result`, {
        expectedRevision: labOrder.revision,
        values: [
          {
            test: 'Hemoglobin',
            value: '13.2',
            unit: 'g/dL',
            referenceRange: '12-16',
            flag: 'normal',
          },
        ],
        notes: null,
      }).expect(201)
    ).body;
    const draft = labOrder.results[0];
    labOrder = (
      await post('medtech', `/lab-results/${draft.id as string}/finalize`, {
        expectedRevision: draft.revision,
        expectedOrderRevision: labOrder.revision,
      }).expect(201)
    ).body;
    const linked = await post(
      'medtech',
      `/referrals/${labReferralId}/complete`,
      {
        expectedRevision: 3,
        completionNote: null,
        completionReference: null,
        labResultId: labOrder.results[0].id,
      },
    ).expect(201);
    expect(linked.body.labResult.id).toBe(labOrder.results[0].id);
    expect(linked.body.labResult.values).toBeUndefined();
    expect(linked.body.labResult.orderId).toBe(labOrder.id);
    const providerView = await get(
      'doctor',
      `/patients/${patient.id}/referrals`,
    ).expect(200);
    expect(
      providerView.body.find((row: Row) => row.id === labReferralId).status,
    ).toBe('completed');
  } finally {
    await app.close();
  }
});
