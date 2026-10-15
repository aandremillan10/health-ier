import { Test } from '@nestjs/testing';
import type { ExecutionContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { expect, it } from 'vitest';
import { StaffGuard } from '../src/auth';
import { ReportsController } from '../src/reports/reports.controller';
import { ReportsService } from '../src/reports/reports.service';
import { DatabaseService } from '../src/database/database.service';
import { configureHttp } from '../src/http';

it('returns operational totals and exports the same snapshot without clinical rows', async () => {
  const id = '10000000-0000-4000-8000-000000000001';
  const events: unknown[] = [];
  const tx = {
    appointment: {
      findMany: async (): Promise<unknown[]> => [
        {
          patientId: 'a',
          patient: { sex: 'female' },
          discipline: 'medical',
          status: 'completed',
          scheduledAt: new Date('2026-10-13T16:30Z'),
        },
        {
          patientId: 'a',
          patient: { sex: 'female' },
          discipline: 'medical',
          status: 'completed',
          scheduledAt: new Date('2026-10-14T01:00Z'),
        },
        {
          patientId: 'b',
          patient: { sex: 'male' },
          discipline: 'dental',
          status: 'arrived',
          scheduledAt: new Date('2026-10-15T01:00Z'),
        },
        {
          patientId: 'c',
          patient: { sex: 'other' },
          discipline: 'medical',
          status: 'no_show',
          scheduledAt: new Date('2026-10-15T02:00Z'),
        },
        {
          patientId: 'd',
          patient: { sex: null },
          discipline: 'medical',
          status: 'scheduled',
          scheduledAt: new Date('2026-10-15T03:00Z'),
        },
      ],
    },
    labOrder: {
      findMany: async (): Promise<unknown[]> => [
        {
          status: 'ordered',
          createdAt: new Date('2026-10-14T00:00Z'),
          results: [],
        },
        {
          status: 'in_progress',
          createdAt: new Date('2026-10-14T00:00Z'),
          results: [],
        },
        {
          status: 'resulted',
          createdAt: new Date('2026-10-14T00:00Z'),
          results: [{ finalizedAt: new Date('2026-10-14T01:00Z') }],
        },
        {
          status: 'reviewed',
          createdAt: new Date('2026-10-14T00:00Z'),
          results: [{ finalizedAt: new Date('2026-10-14T02:00Z') }],
        },
      ],
    },
    patient: { count: async (): Promise<number> => 3 },
    auditEvent: {
      create: async (value: unknown): Promise<object> => {
        events.push(value);
        return {};
      },
    },
  };
  const module = await Test.createTestingModule({
    controllers: [ReportsController],
    providers: [
      ReportsService,
      {
        provide: DatabaseService,
        useValue: {
          $transaction: async (
            work: (database: typeof tx) => Promise<unknown>,
          ): Promise<unknown> => work(tx),
        },
      },
    ],
  })
    .overrideGuard(StaffGuard)
    .useValue({
      canActivate(context: ExecutionContext): boolean {
        const req = context
          .switchToHttp()
          .getRequest<{ headers: Record<string, string>; staff: unknown }>();
        req.staff = {
          id,
          displayName: 'Synthetic head',
          role: 'doctor',
          isHead: req.headers['x-test-head'] === 'yes',
        };
        return true;
      },
    })
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({
    bodyParser: false,
  });
  configureHttp(app);
  await app.init();
  try {
    await request(app.getHttpServer())
      .get('/reports?from=2026-10-14&to=2026-10-15')
      .expect(403);
    const read = await request(app.getHttpServer())
      .get('/reports?from=2026-10-14&to=2026-10-15')
      .set('x-test-head', 'yes')
      .expect(200);
    expect(read.body.totals).toEqual({
      visits: 3,
      noShows: 1,
      pendingLabs: 2,
      averageLabMinutes: 90,
      newPatients: 3,
    });
    expect(read.body.totals).not.toHaveProperty('employees');
    expect(read.body.totals).not.toHaveProperty('dependents');
    expect(read.body.daily).toEqual([
      { date: '2026-10-14', visits: 2 },
      { date: '2026-10-15', visits: 1 },
    ]);
    expect(read.body.departments).toEqual([
      { discipline: 'medical', patients: 1 },
      { discipline: 'dental', patients: 1 },
      { discipline: 'laboratory', patients: 0 },
    ]);
    expect(read.body.sexBreakdown).toEqual([
      { sex: 'female', patients: 1 },
      { sex: 'male', patients: 1 },
      { sex: 'other', patients: 0 },
      { sex: 'not_recorded', patients: 0 },
    ]);
    expect(read.body).not.toHaveProperty('patients');
    const exported = await request(app.getHttpServer())
      .post('/reports/export')
      .set('x-test-head', 'yes')
      .send({
        from: '2026-10-14',
        to: '2026-10-15',
        fingerprint: read.body.fingerprint,
      })
      .expect(201);
    expect(exported.body.csv).toContain('summary,Visits,3,count');
    expect(exported.body.csv).toContain(
      'summary,Average laboratory turnaround,90,minutes',
    );
    expect(exported.body.csv).toContain('sex,female,1,patients');
    expect(exported.body.csv).not.toContain('Eligible employees');
    expect(exported.body.csv).not.toContain('Eligible dependents');
    expect(events).toHaveLength(1);
    await request(app.getHttpServer())
      .post('/reports/export')
      .set('x-test-head', 'yes')
      .send({
        from: '2026-10-14',
        to: '2026-10-15',
        fingerprint: '0'.repeat(64),
      })
      .expect(409);
  } finally {
    await app.close();
  }
});
