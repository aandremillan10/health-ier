import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service';
import { HistoricalStorage } from '../historical-documents/historical-storage';
import { snapshot, type MirrorEvent } from '../mirror-contract';
import { MirrorService } from './mirror.service';
import { parseBatch } from './validation';

const patientId = '20000000-0000-4000-8000-000000000001';
const uploaderId = '10000000-0000-4000-8000-000000000001';
const id = '30000000-0000-4000-8000-000000000001';
const prefix = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n';
const bytes = Buffer.from(
  `${prefix}xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R /Size 1 >>\nstartxref\n${prefix.length}\n%%EOF\n`,
);
const row = {
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
  byteLength: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  objectKey: 'edge-private-object-key',
  createdAt: new Date('2026-10-15T00:00:00Z'),
  revision: 1,
  replacesId: null,
  replacementReason: null,
};
function event(): MirrorEvent {
  return {
    eventId: '40000000-0000-4000-8000-000000000001',
    clinicId: 'synthetic-clinic',
    schemaVersion: 1,
    entityType: 'historicalDocument',
    entityId: id,
    revision: 1,
    operation: 'upsert',
    payload: snapshot('historicalDocument', row),
  };
}
async function fixture(): Promise<{
  service: MirrorService;
  put: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  entities: Map<string, { payload: object }>;
  receiptCreate: ReturnType<typeof vi.fn>;
  pendingUpdate: ReturnType<typeof vi.fn>;
  outboxFind: ReturnType<typeof vi.fn>;
  versionFind: ReturnType<typeof vi.fn>;
}> {
  const put = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn().mockResolvedValue(bytes);
  const entities = new Map<string, { payload: object }>([
    [uploaderId, { payload: { role: 'doctor' } }],
    [patientId, { payload: {} }],
  ]);
  const receiptCreate = vi.fn().mockResolvedValue({});
  const pendingUpdate = vi.fn().mockResolvedValue({});
  const outboxFind = vi.fn().mockResolvedValue([]);
  const versionFind = vi.fn().mockResolvedValue(null);
  const receipts = new Map<string, { hash: string; revision: number }>();
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    mirrorEntity: {
      findUnique: async ({
        where,
      }: {
        where: { clinicId_entityType_entityId: { entityId: string } };
      }): Promise<{ payload: object } | null> =>
        entities.get(where.clinicId_entityType_entityId.entityId) ?? null,
      upsert: vi.fn().mockResolvedValue({}),
    },
    mirrorVersion: {
      findUnique: versionFind,
      create: vi.fn().mockResolvedValue({}),
    },
    mirrorReceipt: {
      findUnique: async ({
        where,
      }: {
        where: { clinicId_eventId: { eventId: string } };
      }): Promise<{ hash: string; revision: number } | null> =>
        receipts.get(where.clinicId_eventId.eventId) ?? null,
      create: receiptCreate,
    },
    outbox: { findMany: outboxFind, updateMany: pendingUpdate },
    mirrorState: { upsert: vi.fn().mockResolvedValue({}) },
    historicalDocument: { findUnique: vi.fn().mockResolvedValue(row) },
  };
  receiptCreate.mockImplementation(
    async ({
      data,
    }: {
      data: { eventId: string; hash: string; revision: number };
    }): Promise<object> => {
      receipts.set(data.eventId, data);
      return {};
    },
  );
  const module = await Test.createTestingModule({
    providers: [
      MirrorService,
      { provide: HistoricalStorage, useValue: { put, get } },
      {
        provide: DatabaseService,
        useValue: {
          ...tx,
          $transaction: async (
            work:
              ((database: typeof tx) => Promise<unknown>) | Promise<unknown>[],
          ): Promise<unknown> =>
            Array.isArray(work) ? Promise.all(work) : work(tx),
        },
      },
    ],
  }).compile();
  return {
    service: module.get(MirrorService),
    put,
    get,
    entities,
    receiptCreate,
    pendingUpdate,
    outboxFind,
    versionFind,
  };
}
describe('historical one-way mirror invariants', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('whitelists immutable metadata while excluding bytes and private storage keys', () => {
    const value = event();
    expect(
      parseBatch({ clinicId: value.clinicId, events: [value] }, value.clinicId),
    ).toEqual([value]);
    for (const key of ['contentBase64', 'objectKey', 'passwordHash'])
      expect(() =>
        parseBatch(
          {
            clinicId: value.clinicId,
            events: [
              { ...value, payload: { ...value.payload, [key]: 'private' } },
            ],
          },
          value.clinicId,
        ),
      ).toThrow();
    expect(() =>
      parseBatch(
        {
          clinicId: value.clinicId,
          events: [
            {
              ...value,
              revision: 2,
              payload: { ...value.payload, revision: 2 },
            },
          ],
        },
        value.clinicId,
      ),
    ).toThrow();
  });
  it('requires CLOUD mode, exact clinic, dependencies and matching bytes before staging', async () => {
    const { service, put, entities } = await fixture();
    const body = {
      clinicId: 'synthetic-clinic',
      event: event(),
      contentBase64: bytes.toString('base64'),
    };
    vi.stubEnv('SERVER_MODE', 'EDGE');
    await expect(service.stageHistorical(body)).rejects.toThrow('WRONG_MODE');
    vi.stubEnv('SERVER_MODE', 'CLOUD');
    await expect(
      service.stageHistorical({ ...body, clinicId: 'other' }),
    ).rejects.toThrow('WRONG_CLINIC');
    await expect(
      service.stageHistorical({
        ...body,
        contentBase64: Buffer.from('wrong').toString('base64'),
      }),
    ).rejects.toThrow();
    entities.delete(patientId);
    await expect(service.stageHistorical(body)).rejects.toThrow(
      'MISSING_DEPENDENCY',
    );
    expect(put).not.toHaveBeenCalled();
    entities.set(patientId, { payload: {} });
    await expect(service.stageHistorical(body)).resolves.toEqual({
      stored: true,
    });
    expect(put).toHaveBeenCalledExactlyOnceWith(
      `synthetic-clinic/historical/${id}/${row.sha256}`,
      bytes,
      row.mimeType,
      row.sha256,
    );
  });
  it('never acknowledges a missing or corrupt cloud object', async () => {
    const { service, get, receiptCreate } = await fixture();
    vi.stubEnv('SERVER_MODE', 'CLOUD');
    const envelope = { clinicId: 'synthetic-clinic', events: [event()] };
    get.mockRejectedValueOnce(new Error('private-S3-detail'));
    expect(await service.ingest(envelope)).toMatchObject({
      acknowledged: [],
      rejected: [{ code: 'DATABASE_UNAVAILABLE' }],
    });
    get.mockResolvedValueOnce(Buffer.from('corrupt'));
    expect(await service.ingest(envelope)).toMatchObject({
      acknowledged: [],
      rejected: [{ code: 'INVALID_REFERENCE' }],
    });
    expect(receiptCreate).not.toHaveBeenCalled();
  });
  it('acknowledges only after verified bytes, and replay after lost acknowledgement creates no extra receipt', async () => {
    const { service, get, receiptCreate } = await fixture();
    vi.stubEnv('SERVER_MODE', 'CLOUD');
    const envelope = { clinicId: 'synthetic-clinic', events: [event()] };
    const first = await service.ingest(envelope);
    const replay = await service.ingest(envelope);
    expect(first).toEqual({
      acknowledged: [{ eventId: event().eventId, revision: 1 }],
      rejected: [],
    });
    expect(replay).toEqual(first);
    expect(receiptCreate).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.invocationCallOrder[0]).toBeLessThan(
      receiptCreate.mock.invocationCallOrder[0],
    );
  });
  it('rejects a conflicting immutable manifest before storing another cloud blob', async () => {
    const { service, versionFind, put } = await fixture();
    vi.stubEnv('SERVER_MODE', 'CLOUD');
    versionFind.mockResolvedValue({ hash: 'different' });
    await expect(
      service.stageHistorical({
        clinicId: 'synthetic-clinic',
        event: event(),
        contentBase64: bytes.toString('base64'),
      }),
    ).rejects.toThrow('IMMUTABLE_CONFLICT');
    expect(put).not.toHaveBeenCalled();
  });
  it('delivers parent events while child blob staging fails, and leaves the child unacknowledged for retry', async () => {
    const { service, outboxFind, pendingUpdate } = await fixture();
    vi.stubEnv('SERVER_MODE', 'EDGE');
    const parent: MirrorEvent = {
      eventId: '40000000-0000-4000-8000-000000000002',
      clinicId: 'synthetic-clinic',
      schemaVersion: 1,
      entityType: 'patient',
      entityId: patientId,
      revision: 1,
      operation: 'upsert',
      payload: {
        id: patientId,
        fullName: 'Synthetic patient',
        revision: 1,
        sex: null,
        address: null,
        dateOfBirth: null,
        patientCategory: null,
        employeeIdentifier: null,
        createdAt: '2026-10-15T00:00:00Z',
        updatedAt: '2026-10-15T00:00:00Z',
      },
    };
    outboxFind.mockResolvedValue([event(), parent]);
    const transfer = vi
      .fn()
      .mockRejectedValue(new Error('network interruption'));
    const transport = vi
      .fn()
      .mockImplementation(async (events: MirrorEvent[]): Promise<object> => ({
        acknowledged: events.map((item) => ({
          eventId: item.eventId,
          revision: item.revision,
        })),
      }));
    expect(await service.deliver(transport, transfer)).toBe(1);
    expect(transport).toHaveBeenCalledExactlyOnceWith([parent]);
    expect(pendingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventId: event().eventId, acknowledgedAt: null },
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
    transfer.mockResolvedValue(undefined);
    outboxFind.mockResolvedValue([event()]);
    expect(await service.deliver(transport, transfer)).toBe(1);
  });
});
