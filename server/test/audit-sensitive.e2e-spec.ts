import { Test } from '@nestjs/testing';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StaffGuard } from '../src/auth';
import { ClinicController } from '../src/clinic.controller';
import { ClinicService } from '../src/clinic.service';
import { AuditInterceptor } from '../src/audit/audit.interceptor';
import { DatabaseService } from '../src/database/database.service';
import { configureHttp } from '../src/http';
import type {
  Correction,
  Entry,
  Patient,
} from '../src/generated/prisma/client';
const patientId = '20000000-0000-4000-8000-000000000001';
const entryId = '30000000-0000-4000-8000-000000000001';
const doctorId = '10000000-0000-4000-8000-000000000001';
const clerkId = '10000000-0000-4000-8000-000000000002';
describe('audit through actual patient and clinical service paths', () => {
  let app: NestExpressApplication;
  let patient: Patient;
  let entry: Entry;
  let audits: unknown[];
  let outbox: unknown[];
  let corrections: Correction[];
  let failAudit: boolean;
  beforeEach(async () => {
    const now = new Date('2026-10-15T00:00:00Z');
    patient = {
      id: patientId,
      revision: 1,
      fullName: 'Synthetic patient',
      sex: null,
      address: 'Synthetic address',
      patientCategory: null,
      employeeIdentifier: null,
      dateOfBirth: null,
      createdAt: now,
      updatedAt: now,
    };
    entry = {
      id: entryId,
      patientId,
      authorId: doctorId,
      discipline: 'medical',
      revision: 1,
      status: 'finalized',
      consultationDate: '2026-10-15',
      ageAtConsultation: null,
      cs: null,
      vitalsId: null,
      reason: null,
      findings: 'Synthetic original private clinical findings',
      clinicalImpression: null,
      plan: null,
      text: null,
      createdAt: now,
      updatedAt: now,
    };
    audits = [];
    outbox = [];
    corrections = [];
    failAudit = false;
    const tx = {
      $queryRaw: async (): Promise<unknown[]> => [],
      patient: {
        findUnique: async (): Promise<Patient> => patient,
        update: async ({
          data,
        }: {
          data: { address?: string; revision: { increment: number } };
        }): Promise<Patient> => {
          patient = {
            ...patient,
            ...(data.address === undefined ? {} : { address: data.address }),
            revision: patient.revision + data.revision.increment,
          };
          return patient;
        },
      },
      entry: {
        findUnique: async (): Promise<Entry> => entry,
        update: async (): Promise<Entry> => {
          entry = { ...entry, revision: entry.revision + 1 };
          return entry;
        },
      },
      correction: {
        create: async ({
          data,
        }: {
          data: Omit<Correction, 'id' | 'revision' | 'createdAt'>;
        }): Promise<Correction> => {
          const correction = {
            ...data,
            id: '40000000-0000-4000-8000-000000000001',
            revision: 1,
            createdAt: now,
          };
          corrections.push(correction);
          return correction;
        },
      },
      staff: {
        findUniqueOrThrow: async (): Promise<{ displayName: string }> => ({
          displayName: 'Synthetic author',
        }),
      },
      outbox: {
        create: async (value: unknown): Promise<object> => {
          outbox.push(value);
          return {};
        },
      },
      auditEvent: {
        create: async (value: unknown): Promise<object> => {
          if (failAudit) throw new Error('synthetic-private-database-error');
          audits.push(value);
          return {};
        },
      },
    };
    const module = await Test.createTestingModule({
      controllers: [ClinicController],
      providers: [
        ClinicService,
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
        {
          provide: DatabaseService,
          useValue: {
            ...tx,
            $transaction: async (
              work: (database: typeof tx) => Promise<unknown>,
            ): Promise<unknown> => {
              const before = {
                patient,
                entry,
                auditCount: audits.length,
                outboxCount: outbox.length,
                correctionCount: corrections.length,
              };
              try {
                return await work(tx);
              } catch (error: unknown) {
                patient = before.patient;
                entry = before.entry;
                audits.length = before.auditCount;
                outbox.length = before.outboxCount;
                corrections.length = before.correctionCount;
                throw error;
              }
            },
          },
        },
      ],
    })
      .overrideGuard(StaffGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          const req = context
            .switchToHttp()
            .getRequest<{ staff: unknown; headers: Record<string, string> }>();
          const clerk = req.headers['x-test-role'] === 'clerk';
          req.staff = {
            id: clerk ? clerkId : doctorId,
            displayName: clerk ? 'Synthetic clerk' : 'Synthetic doctor',
            role: clerk ? 'clerk' : 'doctor',
            isHead: false,
          };
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
  afterEach(async () => {
    await app.close();
  });
  it('patient open records actor/time-resource metadata through the real read path', async () => {
    await request(app.getHttpServer())
      .get(`/patients/${patientId}`)
      .expect(200);
    expect(audits).toEqual([
      {
        data: expect.objectContaining({
          actorId: doctorId,
          action: 'view',
          patientId,
          resourceId: patientId,
          outcome: 'success',
        }),
      },
    ]);
  });
  it('registry edit records the actual clerk and patient in the same successful transaction', async () => {
    await request(app.getHttpServer())
      .patch(`/patients/${patientId}`)
      .set('x-test-role', 'clerk')
      .send({ expectedRevision: 1, address: 'Synthetic updated address' })
      .expect(200);
    expect(patient.revision).toBe(2);
    expect(outbox).toHaveLength(1);
    expect(audits).toEqual([
      {
        data: expect.objectContaining({
          actorId: clerkId,
          actorRole: 'clerk',
          action: 'change',
          patientId,
          resourceId: patientId,
          outcome: 'success',
        }),
      },
    ]);
  });
  it('clinical correction preserves original findings and audits the original resource without note contents', async () => {
    await request(app.getHttpServer())
      .post(`/entries/${entryId}/corrections`)
      .send({
        expectedRevision: 1,
        reason: 'Synthetic private correction reason',
        correctedContent: { findings: 'Synthetic corrected private findings' },
      })
      .expect(201);
    expect(entry.findings).toBe('Synthetic original private clinical findings');
    expect(corrections).toHaveLength(1);
    expect(outbox).toHaveLength(2);
    expect(audits).toEqual([
      {
        data: expect.objectContaining({
          actorId: doctorId,
          action: 'correction',
          patientId,
          resourceId: entryId,
          outcome: 'success',
        }),
      },
    ]);
    expect(JSON.stringify(audits)).not.toMatch(
      /private findings|private clinical|private correction/,
    );
  });
  it('audit storage failure rolls back patient changes and outbox rather than confirming an unaudited save', async () => {
    failAudit = true;
    const failed = await request(app.getHttpServer())
      .patch(`/patients/${patientId}`)
      .set('x-test-role', 'clerk')
      .send({ expectedRevision: 1, address: 'Synthetic unsaved address' })
      .expect(503);
    expect(patient.address).toBe('Synthetic address');
    expect(patient.revision).toBe(1);
    expect(outbox).toHaveLength(0);
    expect(audits).toHaveLength(0);
    expect(JSON.stringify(failed.body)).not.toContain('private');
  });
});
