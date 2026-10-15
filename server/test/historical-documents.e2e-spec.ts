import { Test } from '@nestjs/testing';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffGuard } from '../src/auth';
import { DatabaseService } from '../src/database/database.service';
import type { HistoricalDocument } from '../src/generated/prisma/client';
import { configureHttp } from '../src/http';
import { HistoricalDocumentsController } from '../src/historical-documents/historical-documents.controller';
import { HistoricalDocumentsService } from '../src/historical-documents/historical-documents.service';
import { HistoricalStorage } from '../src/historical-documents/historical-storage';
import { AuditInterceptor } from '../src/audit/audit.interceptor';

const patientId = '20000000-0000-4000-8000-000000000001';
const actorId = '10000000-0000-4000-8000-000000000001';
const id = '30000000-0000-4000-8000-000000000001';
const original = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n';
export const syntheticPdf = Buffer.from(
  `${original}xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R /Size 1 >>\nstartxref\n${Buffer.byteLength(original)}\n%%EOF\n`,
);
const upload = {
  id,
  discipline: 'medical',
  documentType: 'Historical chart',
  documentDate: '2026-10-01',
  description: 'Synthetic historical record',
  filename: 'synthetic.pdf',
  mimeType: 'application/pdf',
  contentBase64: syntheticPdf.toString('base64'),
};

describe('historical document HTTP trust and consistency', () => {
  let app: NestExpressApplication;
  let rows: Map<string, HistoricalDocument>;
  let objects: Map<string, Buffer>;
  let audits: unknown[];
  let outbox: unknown[];
  let failTransaction: boolean;
  let ambiguousCommit: boolean;
  let failLookup: boolean;
  const put = vi.fn();
  const get = vi.fn();
  const remove = vi.fn();
  beforeEach(async () => {
    rows = new Map();
    objects = new Map();
    audits = [];
    outbox = [];
    failTransaction = false;
    ambiguousCommit = false;
    failLookup = false;
    put
      .mockReset()
      .mockImplementation(async (key: string, bytes: Buffer): Promise<void> => {
        objects.set(key, Buffer.from(bytes));
      });
    get.mockReset().mockImplementation(async (key: string): Promise<Buffer> => {
      const bytes = objects.get(key);
      if (!bytes) throw new Error('storage-private-detail');
      return bytes;
    });
    remove
      .mockReset()
      .mockImplementation(async (key: string): Promise<void> => {
        objects.delete(key);
      });
    const table = {
      findUnique: async ({
        where,
      }: {
        where: { id?: string; replacesId?: string };
      }): Promise<HistoricalDocument | null> => {
        if (failLookup) throw new Error('database-private-detail');
        return where.id
          ? (rows.get(where.id) ?? null)
          : ([...rows.values()].find(
              (row) => row.replacesId === where.replacesId,
            ) ?? null);
      },
      findMany: async ({
        where,
      }: {
        where: { patientId: string; discipline: string | { in: string[] } };
      }): Promise<HistoricalDocument[]> =>
        [...rows.values()].filter(
          (row) =>
            row.patientId === where.patientId &&
            (typeof where.discipline === 'string'
              ? row.discipline === where.discipline
              : where.discipline.in.includes(row.discipline)),
        ),
      create: async ({
        data,
      }: {
        data: Omit<HistoricalDocument, 'createdAt'>;
      }): Promise<HistoricalDocument> => {
        if (
          rows.has(data.id) ||
          (data.replacesId &&
            [...rows.values()].some(
              (row) => row.replacesId === data.replacesId,
            ))
        )
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = { ...data, createdAt: new Date('2026-10-15T00:00:00Z') };
        rows.set(row.id, row);
        return row;
      },
    };
    const tx = {
      historicalDocument: table,
      patient: {
        findUnique: async (): Promise<{ id: string }> => ({ id: patientId }),
      },
      auditEvent: {
        create: async (event: unknown): Promise<object> => {
          audits.push(event);
          return {};
        },
      },
      outbox: {
        create: async (event: unknown): Promise<object> => {
          outbox.push(event);
          return {};
        },
      },
    };
    const module = await Test.createTestingModule({
      controllers: [HistoricalDocumentsController],
      providers: [
        HistoricalDocumentsService,
        { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
        { provide: HistoricalStorage, useValue: { put, get, remove } },
        {
          provide: DatabaseService,
          useValue: {
            ...tx,
            $transaction: async (
              work: (database: typeof tx) => Promise<unknown>,
            ): Promise<unknown> => {
              const prior = new Map(rows);
              const auditCount = audits.length;
              const outboxCount = outbox.length;
              try {
                const value = await work(tx);
                if (failTransaction)
                  throw new Error('transaction-private-detail');
                if (ambiguousCommit) {
                  failLookup = true;
                  throw new Error('commit-connection-lost');
                }
                return value;
              } catch (error: unknown) {
                if (!ambiguousCommit) {
                  rows = prior;
                  audits.length = auditCount;
                  outbox.length = outboxCount;
                }
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
            .getRequest<{ headers: Record<string, string>; staff: unknown }>();
          req.staff = {
            id: actorId,
            displayName: 'Synthetic uploader',
            role: req.headers['x-test-role'] ?? 'doctor',
            isHead: req.headers['x-test-head'] === 'yes',
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

  it('uploads once, preserves exact metadata/content across clients and audits/outboxes atomically', async () => {
    const created = await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send(upload)
      .expect(201);
    expect(created.body).toMatchObject({
      id,
      patientId,
      uploaderId: actorId,
      filename: 'synthetic.pdf',
      byteLength: syntheticPdf.length,
    });
    expect(created.body).not.toHaveProperty('objectKey');
    expect(outbox).toHaveLength(1);
    expect(audits).toContainEqual({
      data: expect.objectContaining({
        actorId,
        action: 'import',
        patientId,
        resourceId: id,
        outcome: 'success',
      }),
    });
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send(upload)
      .expect(201);
    expect(rows.size).toBe(1);
    expect(put).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
    expect(outbox).toHaveLength(1);
    const listed = await request(app.getHttpServer())
      .get(`/patients/${patientId}/historical-documents`)
      .expect(200);
    expect(listed.body.documents).toHaveLength(1);
    await request(app.getHttpServer())
      .get(`/patients/${patientId}/historical-documents/${id}`)
      .expect(200);
    const read = await request(app.getHttpServer())
      .get(`/patients/${patientId}/historical-documents/${id}/content`)
      .expect(200);
    expect(Buffer.from(read.body.contentBase64, 'base64')).toEqual(
      syntheticPdf,
    );
    expect(audits).toContainEqual({
      data: expect.objectContaining({
        action: 'view',
        patientId,
        resourceId: id,
        resourceType: 'historical-document',
      }),
    });
    expect(JSON.stringify(audits)).not.toContain(upload.contentBase64);
    expect(JSON.stringify(outbox)).not.toContain(upload.contentBase64);
  });
  it.each(['clerk', 'attendant', 'dentist', 'medtech'])(
    'denies medical upload and contents for %s without storage access',
    async (role) => {
      await request(app.getHttpServer())
        .post(`/patients/${patientId}/historical-documents`)
        .send(upload)
        .expect(201);
      get.mockClear();
      await request(app.getHttpServer())
        .post(`/patients/${patientId}/historical-documents`)
        .set('x-test-role', role)
        .send(upload)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/patients/${patientId}/historical-documents/${id}/content`)
        .set('x-test-role', role)
        .expect(403);
      expect(get).not.toHaveBeenCalled();
    },
  );
  it('head reads all disciplines but cannot import outside own medical authority', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .set('x-test-role', 'dentist')
      .send({ ...upload, discipline: 'dental' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/patients/${patientId}/historical-documents/${id}/content`)
      .set('x-test-head', 'yes')
      .expect(200);
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .set('x-test-head', 'yes')
      .send({ ...upload, discipline: 'dental' })
      .expect(403);
  });
  it('rejects wrong patient before retrieving content', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send(upload)
      .expect(201);
    await request(app.getHttpServer())
      .get(
        `/patients/20000000-0000-4000-8000-000000000002/historical-documents/${id}/content`,
      )
      .expect(404);
    expect(get).not.toHaveBeenCalled();
  });
  it.each([
    { contentBase64: '' },
    { contentBase64: 'invalid===' },
    { contentBase64: Buffer.from('not-pdf').toString('base64') },
    { filename: '../escape.pdf' },
    { filename: 'wrong.jpg' },
    { mimeType: 'text/html' },
    { documentDate: '2026-02-30' },
    { uploaderId: actorId },
    { replacementReason: 'Unlinked' },
  ])('rejects malformed or forged upload %j before storage', async (change) => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send({ ...upload, ...change })
      .expect(400);
    expect(put).not.toHaveBeenCalled();
    expect(outbox).toHaveLength(0);
    expect(rows.size).toBe(0);
  });
  it('rejects conflicting retry without replacing bytes', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send(upload)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send({ ...upload, description: 'Changed' })
      .expect(409);
    expect(put).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });
  it('keeps the original when replacement creates a distinct immutable record and rejects another successor', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send(upload)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send({
        ...upload,
        id: '30000000-0000-4000-8000-000000000002',
        replacesId: id,
        replacementReason: 'Better synthetic scan',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send({
        ...upload,
        id: '30000000-0000-4000-8000-000000000003',
        replacesId: id,
        replacementReason: 'Competing synthetic scan',
      })
      .expect(409);
    expect(rows.size).toBe(2);
    expect(objects.size).toBe(2);
    expect(remove).not.toHaveBeenCalled();
  });
  it('S3 failure never commits metadata, import success or outbox', async () => {
    put.mockRejectedValue(new Error('storage-private-detail'));
    const failed = await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send(upload)
      .expect(503);
    expect(JSON.stringify(failed.body)).not.toContain('private-detail');
    expect(rows.size).toBe(0);
    expect(outbox).toHaveLength(0);
    expect(audits).not.toContainEqual({
      data: expect.objectContaining({ action: 'import', outcome: 'success' }),
    });
  });
  it('rolls back metadata/audit/outbox and compensates a known failed transaction', async () => {
    failTransaction = true;
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send(upload)
      .expect(503);
    expect(rows.size).toBe(0);
    expect(outbox).toHaveLength(0);
    expect(objects.size).toBe(0);
    expect(remove).toHaveBeenCalledOnce();
  });
  it('reports failure without deleting a possibly committed object after connection loss', async () => {
    ambiguousCommit = true;
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send(upload)
      .expect(503);
    expect(rows.size).toBe(1);
    expect(objects.size).toBe(1);
    expect(remove).not.toHaveBeenCalled();
  });
  it('cleanup failure does not turn rollback into success or expose a private object', async () => {
    failTransaction = true;
    remove.mockRejectedValue(new Error('storage-private-detail'));
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send(upload)
      .expect(503);
    expect(rows.size).toBe(0);
    expect(objects.size).toBe(1);
    expect(outbox).toHaveLength(0);
    await request(app.getHttpServer())
      .get(`/patients/${patientId}/historical-documents/${id}/content`)
      .expect(404);
  });
  it('corrupt stored bytes never produce a successful preview', async () => {
    await request(app.getHttpServer())
      .post(`/patients/${patientId}/historical-documents`)
      .send(upload)
      .expect(201);
    get.mockResolvedValue(Buffer.from('corrupt'));
    await request(app.getHttpServer())
      .get(`/patients/${patientId}/historical-documents/${id}/content`)
      .expect(503);
  });
});
