import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const { send, configure } = vi.hoisted(() => ({
  send: vi.fn(),
  configure: vi.fn(),
}));
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...actual,
    S3Client: class {
      constructor(options: unknown) {
        configure(options);
      }
      send = send;
    },
  };
});
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { HistoricalStorage } from './historical-storage';
import { historicalFileLimit } from './file-validation';
describe('bounded immutable S3 storage', () => {
  beforeEach(() => {
    send.mockReset();
    configure.mockReset();
    vi.stubEnv('HISTORICAL_S3_ENDPOINT', 'https://synthetic.storage.invalid');
    vi.stubEnv('HISTORICAL_S3_BUCKET', 'synthetic-private-bucket');
    vi.stubEnv('HISTORICAL_S3_REGION', 'auto');
    vi.stubEnv('HISTORICAL_S3_FORCE_PATH_STYLE', 'false');
    vi.stubEnv('HISTORICAL_S3_ACCESS_KEY', 'synthetic-app-access');
    vi.stubEnv('HISTORICAL_S3_SECRET_KEY', 'synthetic-app-secret');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('uses private virtual-host cloud settings and immutable checksum-verified puts', async () => {
    send.mockResolvedValue({});
    const bytes = Buffer.from('synthetic');
    const checksum = createHash('sha256').update(bytes).digest('hex');
    await new HistoricalStorage().put(
      'opaque-key',
      bytes,
      'application/pdf',
      checksum,
    );
    expect(configure).toHaveBeenCalledWith(
      expect.objectContaining({
        region: 'auto',
        forcePathStyle: false,
        maxAttempts: 2,
      }),
    );
    const command: unknown = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    if (!(command instanceof PutObjectCommand))
      throw new Error('Wrong command');
    expect(command.input).toMatchObject({
      Key: 'opaque-key',
      Bucket: 'synthetic-private-bucket',
      IfNoneMatch: '*',
      ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
      ContentLength: bytes.length,
    });
  });
  it('replays only identical existing bytes and rejects an immutable key collision', async () => {
    const bytes = Buffer.from('synthetic');
    const checksum = createHash('sha256').update(bytes).digest('hex');
    send
      .mockRejectedValueOnce(
        Object.assign(new Error('exists'), { name: 'PreconditionFailed' }),
      )
      .mockResolvedValueOnce({
        ContentLength: bytes.length,
        Body: Readable.from([bytes]),
      });
    await expect(
      new HistoricalStorage().put(
        'opaque-key',
        bytes,
        'application/pdf',
        checksum,
      ),
    ).resolves.toBeUndefined();
    expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
    send
      .mockRejectedValueOnce(
        Object.assign(new Error('exists'), { name: 'PreconditionFailed' }),
      )
      .mockResolvedValueOnce({
        ContentLength: 5,
        Body: Readable.from([Buffer.from('other')]),
      });
    await expect(
      new HistoricalStorage().put(
        'opaque-key',
        bytes,
        'application/pdf',
        checksum,
      ),
    ).rejects.toThrow('identity conflict');
  });
  it('bounds declared and streamed size and refuses truncated objects', async () => {
    const storage = new HistoricalStorage();
    send.mockResolvedValueOnce({
      ContentLength: historicalFileLimit + 1,
      Body: Readable.from([]),
    });
    await expect(storage.get('opaque-key')).rejects.toThrow('size');
    send.mockResolvedValueOnce({
      ContentLength: 5,
      Body: Readable.from([Buffer.from('x')]),
    });
    await expect(storage.get('opaque-key')).rejects.toThrow('Incomplete');
    send.mockResolvedValueOnce({
      ContentLength: 1,
      Body: Readable.from([Buffer.alloc(historicalFileLimit + 1)]),
    });
    await expect(storage.get('opaque-key')).rejects.toThrow('limit');
  });
  it('deletes only an explicit opaque key and does not silently use any default bucket', async () => {
    send.mockResolvedValue({});
    await new HistoricalStorage().remove('one-opaque-key');
    const command: unknown = send.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    if (!(command instanceof DeleteObjectCommand))
      throw new Error('Wrong command');
    expect(command.input.Key).toBe('one-opaque-key');
    vi.stubEnv('HISTORICAL_S3_BUCKET', '');
    send.mockClear();
    await expect(new HistoricalStorage().get('anything')).rejects.toThrow(
      'unavailable',
    );
    expect(send).not.toHaveBeenCalled();
  });
});
