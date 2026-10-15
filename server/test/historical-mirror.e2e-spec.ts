import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service';
import { HistoricalStorage } from '../src/historical-documents/historical-storage';
import { configureHttp } from '../src/http';
import { MirrorController } from '../src/mirror/mirror.controller';
import { MirrorService } from '../src/mirror/mirror.service';
import { ClinicController } from '../src/clinic.controller';
import { ClinicService } from '../src/clinic.service';
import { AuthService, StaffGuard } from '../src/auth';

const token = 'synthetic-machine-only-token'.repeat(3);
const patientId = '20000000-0000-4000-8000-000000000001';
const uploaderId = '10000000-0000-4000-8000-000000000001';
const id = '30000000-0000-4000-8000-000000000001';
const prefix = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n';
const file = Buffer.from(
  `${prefix}xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R /Size 1 >>\nstartxref\n${prefix.length}\n%%EOF\n`,
);
const event = {
  eventId: '40000000-0000-4000-8000-000000000001',
  clinicId: 'synthetic-clinic',
  schemaVersion: 1,
  entityType: 'historicalDocument',
  entityId: id,
  revision: 1,
  operation: 'upsert',
  payload: {
    id,
    patientId,
    uploaderId,
    uploaderName: 'Synthetic uploader',
    discipline: 'medical',
    documentType: 'Historical chart',
    documentDate: '2026-10-01',
    description: 'Synthetic scan',
    filename: 'synthetic.pdf',
    mimeType: 'application/pdf',
    byteLength: file.length,
    sha256: createHash('sha256').update(file).digest('hex'),
    createdAt: '2026-10-15T00:00:00Z',
    revision: 1,
    replacesId: null,
    replacementReason: null,
  },
};
describe('historical companion machine HTTP boundary', () => {
  let app: NestExpressApplication;
  const put = vi.fn();
  beforeEach(async () => {
    vi.stubEnv('SERVER_MODE', 'CLOUD');
    vi.stubEnv('CLINIC_ID', 'synthetic-clinic');
    vi.stubEnv('MIRROR_MACHINE_TOKEN', token);
    put.mockReset().mockResolvedValue(undefined);
    const tx = {
      mirrorEntity: {
        findUnique: async ({
          where,
        }: {
          where: { clinicId_entityType_entityId: { entityId: string } };
        }): Promise<{ payload: object } | null> =>
          where.clinicId_entityType_entityId.entityId === uploaderId
            ? { payload: { role: 'doctor' } }
            : where.clinicId_entityType_entityId.entityId === patientId
              ? { payload: {} }
              : null,
      },
      mirrorVersion: { findUnique: async (): Promise<null> => null },
    };
    const module = await Test.createTestingModule({
      controllers: [MirrorController, ClinicController],
      providers: [
        MirrorService,
        ClinicService,
        AuthService,
        StaffGuard,
        { provide: HistoricalStorage, useValue: { put } },
        {
          provide: DatabaseService,
          useValue: {
            $transaction: async (
              work: (database: typeof tx) => Promise<unknown>,
            ): Promise<unknown> => work(tx),
          },
        },
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
    vi.unstubAllEnvs();
  });
  it('accepts a valid machine manifest+bytes and denies staff/missing credentials', async () => {
    const body = {
      clinicId: 'synthetic-clinic',
      event,
      contentBase64: file.toString('base64'),
    };
    await request(app.getHttpServer())
      .post('/internal/mirror/historical-files')
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .post('/internal/mirror/historical-files')
      .set('Authorization', 'Bearer synthetic-staff-session')
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .post('/internal/mirror/historical-files')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(200)
      .expect({ stored: true });
    expect(put).toHaveBeenCalledOnce();
  });
  it('rejects wrong clinic and corrupt bytes without touching cloud storage', async () => {
    for (const body of [
      { clinicId: 'other', event, contentBase64: file.toString('base64') },
      {
        clinicId: 'synthetic-clinic',
        event,
        contentBase64: Buffer.from('not-pdf').toString('base64'),
      },
    ]) {
      await request(app.getHttpServer())
        .post('/internal/mirror/historical-files')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect((response) => {
          expect([400, 403]).toContain(response.status);
          expect(JSON.stringify(response.body)).not.toContain(
            body.contentBase64,
          );
        });
    }
    expect(put).not.toHaveBeenCalled();
  });
  it('denies companion writes in EDGE mode and ordinary staff domain writes in CLOUD', async () => {
    const body = {
      clinicId: 'synthetic-clinic',
      event,
      contentBase64: file.toString('base64'),
    };
    vi.stubEnv('SERVER_MODE', 'EDGE');
    await request(app.getHttpServer())
      .post('/internal/mirror/historical-files')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(403);
    vi.stubEnv('SERVER_MODE', 'CLOUD');
    await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', `Bearer ${'a'.repeat(43)}`)
      .send({ fullName: 'Synthetic patient' })
      .expect(403);
    expect(put).not.toHaveBeenCalled();
  });
});
