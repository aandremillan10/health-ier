import { Test } from '@nestjs/testing';
import type { ExecutionContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StaffGuard } from '../src/auth';
import { ClinicController } from '../src/clinic.controller';
import { ClinicService } from '../src/clinic.service';
import { DatabaseService } from '../src/database/database.service';
import { configureHttp } from '../src/http';

const patientId = '20000000-0000-4000-8000-000000000001';
const staff = {
  attendant: {
    id: '18000000-0000-4000-8000-000000000001',
    displayName: 'Synthetic attendant',
    role: 'attendant',
    isHead: false,
  },
  head: {
    id: '18000000-0000-4000-8000-000000000002',
    displayName: 'Synthetic clinic head',
    role: 'doctor',
    isHead: true,
  },
  doctor: {
    id: '18000000-0000-4000-8000-000000000003',
    displayName: 'Synthetic doctor',
    role: 'doctor',
    isHead: false,
  },
} as const;

interface VitalRow {
  id: string;
  patientId: string;
  authorId: string;
  revision: number;
  status: 'draft' | 'finalized';
  recordedAt: Date;
  systolic: number | null;
  diastolic: number | null;
  temperature: number | null;
  pulse: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  height: number | null;
  weight: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CorrectionRow {
  id: string;
  originalType: 'vitals';
  originalEntryId: string;
  authorId: string;
  reason: string;
  correctedContent: Record<string, unknown>;
  sourceRevision: number;
  revision: number;
  createdAt: Date;
}

describe('vital-sign HTTP acceptance', () => {
  let app: NestExpressApplication;
  let rows: VitalRow[];
  let corrections: CorrectionRow[];
  let mirrorEvents: Record<string, unknown>[];

  beforeEach(async () => {
    rows = [];
    corrections = [];
    mirrorEvents = [];
    let nextId = 1;
    const tx = {
      $queryRaw: async (): Promise<[]> => [],
      patient: {
        findUnique: async (): Promise<{ id: string } | null> => ({
          id: patientId,
        }),
      },
      staff: {
        findUniqueOrThrow: async ({
          where,
        }: {
          where: { id: string };
        }): Promise<{ displayName: string }> => ({
          displayName:
            Object.values(staff).find((person) => person.id === where.id)
              ?.displayName ?? 'Unknown synthetic staff',
        }),
      },
      vitals: {
        findMany: async (): Promise<VitalRow[]> => rows,
        findUnique: async ({
          where,
        }: {
          where: { id: string };
        }): Promise<VitalRow | null> =>
          rows.find((row) => row.id === where.id) ?? null,
        create: async ({
          data,
        }: {
          data: Omit<
            VitalRow,
            'id' | 'revision' | 'status' | 'createdAt' | 'updatedAt'
          > & {
            patientId: string;
            authorId: string;
          };
        }): Promise<VitalRow> => {
          const now = new Date('2026-10-15T08:00:00.000Z');
          const row: VitalRow = {
            ...data,
            id: `28000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
            revision: 1,
            status: 'draft',
            systolic: data.systolic ?? null,
            diastolic: data.diastolic ?? null,
            temperature: data.temperature ?? null,
            pulse: data.pulse ?? null,
            respiratoryRate: data.respiratoryRate ?? null,
            oxygenSaturation: data.oxygenSaturation ?? null,
            height: data.height ?? null,
            weight: data.weight ?? null,
            createdAt: now,
            updatedAt: now,
          };
          rows.push(row);
          return row;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }): Promise<VitalRow> => {
          const row = rows.find((item) => item.id === where.id);
          if (!row) throw new Error('Missing synthetic vital-sign record.');
          Object.assign(row, data, {
            revision: row.revision + 1,
            updatedAt: new Date('2026-10-15T08:01:00.000Z'),
          });
          return row;
        },
      },
      correction: {
        findMany: async ({
          where,
        }: {
          where: { originalEntryId: string };
        }): Promise<CorrectionRow[]> =>
          corrections.filter(
            (item) => item.originalEntryId === where.originalEntryId,
          ),
        create: async ({
          data,
        }: {
          data: Omit<CorrectionRow, 'id' | 'revision' | 'createdAt'>;
        }): Promise<CorrectionRow> => {
          const correction: CorrectionRow = {
            ...data,
            id: `38000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
            revision: 1,
            createdAt: new Date('2026-10-15T08:02:00.000Z'),
          };
          corrections.push(correction);
          return correction;
        },
      },
      outbox: {
        create: async ({
          data,
        }: {
          data: Record<string, unknown>;
        }): Promise<object> => {
          mirrorEvents.push(data);
          return {};
        },
      },
      auditEvent: {
        create: async (): Promise<object> => ({}),
      },
    };
    const database = {
      ...tx,
      $transaction: async <T>(work: (transaction: typeof tx) => Promise<T>) =>
        work(tx),
    } as unknown as DatabaseService;
    const module = await Test.createTestingModule({
      controllers: [ClinicController],
      providers: [
        ClinicService,
        { provide: DatabaseService, useValue: database },
      ],
    })
      .overrideGuard(StaffGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          const req = context.switchToHttp().getRequest<{
            headers: Record<string, string>;
            staff: unknown;
          }>();
          req.staff =
            staff[req.headers['x-test-staff'] as keyof typeof staff] ??
            staff.attendant;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      bodyParser: false,
    });
    configureHttp(app);
    await app.init();
  });

  afterEach(async () => app.close());

  it('persists and mirrors nullable height, then lets a clinic head correct another attendant’s finalized record', async () => {
    const client = request(app.getHttpServer());
    const created = await client
      .post(`/patients/${patientId}/vitals`)
      .set('x-test-staff', 'attendant')
      .send({
        recordedAt: '2026-10-15T08:00:00Z',
        systolic: 120,
        diastolic: 80,
        temperature: 36.8,
        pulse: 72,
        respiratoryRate: 16,
        oxygenSaturation: 98,
        height: 165,
        weight: 60,
      })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body).toMatchObject({ height: 165, status: 'draft' });
    expect(mirrorEvents[0]?.payload).toMatchObject({ height: 165 });

    const edited = await client
      .patch(`/vitals/${id}`)
      .set('x-test-staff', 'attendant')
      .send({ expectedRevision: 1, height: 165.5 })
      .expect(200);
    expect(edited.body.height).toBe(165.5);
    await client
      .post(`/vitals/${id}/finalize`)
      .set('x-test-staff', 'attendant')
      .send({ expectedRevision: 2 })
      .expect(201);

    const blank = await client
      .post(`/patients/${patientId}/vitals`)
      .set('x-test-staff', 'attendant')
      .send({ recordedAt: '2026-10-15T08:03:00Z', height: null })
      .expect(201);
    expect(blank.body.height).toBeNull();
    await client
      .patch(`/vitals/${blank.body.id as string}`)
      .set('x-test-staff', 'head')
      .send({ expectedRevision: 1, height: 170 })
      .expect(403);

    const corrected = await client
      .post(`/vitals/${id}/corrections`)
      .set('x-test-staff', 'head')
      .send({
        expectedRevision: 3,
        reason: 'Correct synthetic transcription',
        correctedContent: { systolic: 122, height: 166 },
      })
      .expect(201);
    expect(corrected.body).toMatchObject({
      correction: {
        authorId: staff.head.id,
        authorName: staff.head.displayName,
        reason: 'Correct synthetic transcription',
        sourceRevision: 3,
        correctedContent: { systolic: 122, height: 166 },
      },
      original: {
        authorId: staff.attendant.id,
        status: 'finalized',
        revision: 4,
        systolic: 120,
        height: 165.5,
      },
    });
    expect(mirrorEvents.at(-1)?.payload).toMatchObject({
      authorId: staff.head.id,
      sourceRevision: 3,
      reason: 'Correct synthetic transcription',
    });

    await client
      .post(`/vitals/${id}/corrections`)
      .set('x-test-staff', 'doctor')
      .send({
        expectedRevision: 4,
        reason: 'Non-head cannot correct',
        correctedContent: { height: 167 },
      })
      .expect(403);
    await client
      .post(`/vitals/${id}/corrections`)
      .set('x-test-staff', 'head')
      .send({
        expectedRevision: 3,
        reason: 'Stale source',
        correctedContent: { height: 167 },
      })
      .expect(409);

    const listed = await client
      .get(`/patients/${patientId}/vitals`)
      .set('x-test-staff', 'head')
      .expect(200);
    const original = listed.body.find((row: { id: string }) => row.id === id);
    expect(original).toMatchObject({
      systolic: 120,
      height: 165.5,
      corrections: [
        {
          authorId: staff.head.id,
          authorName: staff.head.displayName,
          sourceRevision: 3,
        },
      ],
    });
    expect(
      listed.body.find((row: { id: string }) => row.id === blank.body.id)
        .height,
    ).toBeNull();
  });
});
