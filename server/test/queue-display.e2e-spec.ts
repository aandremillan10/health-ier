import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentsController } from '../src/appointments.controller';
import { AppointmentsService } from '../src/appointments.service';
import { AuthService, StaffGuard } from '../src/auth';
import { DatabaseService } from '../src/database/database.service';
import { configureHttp } from '../src/http';
import { QueueDisplayController } from '../src/queue-display/queue-display.controller';
import { QueueDisplayService } from '../src/queue-display/queue-display.service';

interface DisplayRow {
  clinicId: string;
  queueDay: string;
  discipline: string;
  status: string;
  queueNumber: number;
  patientId: string;
  patientName: string;
}

// The HTTP stack is real; this small database double honors the selected scope.
describe('public clinic queue HTTP boundary', () => {
  let app: NestExpressApplication;
  let rows: DisplayRow[];
  const findMany = vi.fn();
  beforeEach(async () => {
    vi.stubEnv('SERVER_MODE', 'EDGE');
    vi.stubEnv('CLINIC_ID', 'synthetic-clinic');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T15:59:59.999Z'));
    rows = [];
    findMany.mockReset().mockImplementation(
      async (input: {
        where: {
          clinicId: string;
          queueDay: string;
          discipline: { in: string[] };
          status: { in: string[] };
        };
      }): Promise<DisplayRow[]> =>
        rows
          .filter(
            (row) =>
              row.clinicId === input.where.clinicId &&
              row.queueDay === input.where.queueDay &&
              input.where.discipline.in.includes(row.discipline) &&
              input.where.status.in.includes(row.status),
          )
          .sort(
            (a, b) =>
              a.queueNumber - b.queueNumber ||
              a.discipline.localeCompare(b.discipline),
          ),
    );
    const module = await Test.createTestingModule({
      controllers: [QueueDisplayController, AppointmentsController],
      providers: [
        QueueDisplayService,
        AppointmentsService,
        AuthService,
        StaffGuard,
        { provide: DatabaseService, useValue: { appointment: { findMany } } },
      ],
    }).compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureHttp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function add(
    discipline: string,
    status: string,
    queueNumber: number,
    override: Partial<DisplayRow> = {},
  ): void {
    rows.push({
      clinicId: 'synthetic-clinic',
      queueDay: '2026-10-15',
      discipline,
      status,
      queueNumber,
      patientId: 'private-id',
      patientName: 'Private patient',
      ...override,
    });
  }

  it('publishes only stable tickets, scopes the query, and preserves multiple providers and lab handoffs', async () => {
    add('medical', 'waiting', 3);
    add('medical', 'with_provider', 2);
    add('medical', 'with_provider', 1);
    add('medical', 'lab', 4);
    add('laboratory', 'lab', 1);
    add('laboratory', 'arrived', 2);
    add('dental', 'lab', 3);
    add('dental', 'arrived', 1001);
    for (const status of ['scheduled', 'completed', 'no_show'])
      add('medical', status, 20);
    add('medical', 'waiting', 40, { clinicId: 'other-clinic' });
    add('medical', 'waiting', 41, { queueDay: '2026-10-14' });
    add('medical', 'waiting', 42, { queueDay: '2026-10-16' });
    const result = await request(app.getHttpServer())
      .get('/queue-display/data')
      .expect(200);
    expect(result.body).toEqual({
      date: '2026-10-15',
      updatedAt: '2026-10-15T15:59:59.999Z',
      departments: [
        { discipline: 'medical', serving: ['M001', 'M002'], waiting: ['M003'] },
        { discipline: 'dental', serving: [], waiting: ['D1001'] },
        {
          discipline: 'laboratory',
          serving: ['L001', 'D003', 'M004'],
          waiting: ['L002'],
        },
      ],
    });
    expect(result.text).not.toMatch(/private|patient|history|actor|birth/i);
    expect(findMany).toHaveBeenCalledWith({
      where: {
        clinicId: 'synthetic-clinic',
        queueDay: '2026-10-15',
        discipline: { in: ['medical', 'dental', 'laboratory'] },
        status: { in: ['arrived', 'waiting', 'with_provider', 'lab'] },
      },
      select: { discipline: true, status: true, queueNumber: true },
      orderBy: [{ queueNumber: 'asc' }, { discipline: 'asc' }],
    });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rolls over at Manila midnight and shows an empty new day rather than yesterday', async () => {
    add('medical', 'waiting', 1);
    const before = await request(app.getHttpServer())
      .get('/queue-display/data')
      .expect(200);
    expect(before.body.departments[0].waiting).toEqual(['M001']);
    vi.setSystemTime(new Date('2026-10-15T16:00:00.000Z'));
    const after = await request(app.getHttpServer())
      .get('/queue-display/data')
      .expect(200);
    expect(after.body.date).toBe('2026-10-16');
    expect(
      after.body.departments.every(
        (item: { waiting: string[]; serving: string[] }) =>
          !item.waiting.length && !item.serving.length,
      ),
    ).toBe(true);
  });

  it('refuses date and site selection before querying and keeps appointments authenticated', async () => {
    for (const query of [
      'date=2026-01-01',
      'clinicId=other',
      'discipline=medical',
    ])
      await request(app.getHttpServer())
        .get(`/queue-display/data?${query}`)
        .expect(400);
    await request(app.getHttpServer())
      .get('/appointments?date=2026-10-15')
      .expect(401);
    await request(app.getHttpServer())
      .post('/appointments')
      .send({})
      .expect(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('denies every public queue route on cloud without reading the database', async () => {
    vi.stubEnv('SERVER_MODE', 'CLOUD');
    for (const path of [
      '/',
      '/queue-display/data',
      '/queue-display/display.css',
      '/queue-display/display.js',
    ])
      await request(app.getHttpServer())
        .get(path)
        .expect(404)
        .expect('Content-Type', /application\/json/);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('serves only fixed same-origin assets with restrictive headers', async () => {
    for (const [path, type] of [
      ['/', 'text/html'],
      ['/queue-display/display.css', 'text/css'],
      ['/queue-display/display.js', 'application/javascript'],
    ]) {
      const result = await request(app.getHttpServer()).get(path).expect(200);
      expect(result.headers['content-type']).toContain(type);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.headers['x-frame-options']).toBe('DENY');
      expect(result.headers['content-security-policy']).toContain(
        "frame-ancestors 'none'",
      );
      expect(result.headers['content-security-policy']).not.toContain(
        'unsafe-inline',
      );
    }
    for (const path of [
      '/queue-display/other.js',
      '/queue-display/config.ts',
      '/queue-display/%2e%2e%2fconfig.ts',
    ])
      await request(app.getHttpServer()).get(path).expect(404);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns a safe unavailable response without leaking database errors or caching stale data', async () => {
    findMany.mockRejectedValueOnce(
      new Error('private database password or patient'),
    );
    const result = await request(app.getHttpServer())
      .get('/queue-display/data')
      .expect(503);
    expect(result.body.code).toBe('UNAVAILABLE');
    expect(result.text).not.toMatch(/password|patient|database/);
    expect(result.headers['cache-control']).toBe('no-store');
  });
});
