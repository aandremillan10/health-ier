import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { ClinicBroker } from './broker';
import type { HistoricalFilePicker } from './historical-selection';
import type { HistoricalDocument } from '../shared/historical-documents-api';
const patientId = '20000000-0000-4000-8000-000000000001';
const actorId = '10000000-0000-4000-8000-000000000001';
const sender = {
  senderId: 1,
  isMainFrame: true,
  url: 'file:///clinic/index.html',
};
const fields = {
  discipline: 'medical',
  documentType: 'Historical chart',
  documentDate: '2026-10-01',
  description: 'Synthetic historical record',
} as const;
function response(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
  });
}
function fixture(picker: HistoricalFilePicker): {
  broker: ClinicBroker;
  fetcher: ReturnType<typeof vi.fn>;
} {
  const fetcher = vi.fn().mockImplementation(async (): Promise<Response> =>
    response({
      staff: {
        id: actorId,
        displayName: 'Synthetic doctor',
        role: 'doctor',
        isHead: false,
      },
      token: 'a'.repeat(43),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
  );
  return {
    fetcher,
    broker: new ClinicBroker({
      serverUrl: 'https://clinic.example',
      allowSyntheticHttp: false,
      packaged: true,
      rendererUrl: sender.url,
      senderId: sender.senderId,
      fetch: fetcher,
      reset: vi.fn(),
      printer: {
        cancel: vi.fn(),
        listPrinters: async () => [],
        print: async () => undefined,
      },
      historicalFilePicker: picker,
    }),
  };
}
async function login(broker: ClinicBroker): Promise<void> {
  expect(
    (
      await broker.invoke(
        'login',
        { username: 'synthetic', password: 'synthetic' },
        sender,
      )
    ).ok,
  ).toBe(true);
}
function metadata(id: string, bytes: Uint8Array): HistoricalDocument {
  return {
    id,
    patientId,
    ...fields,
    filename: 'synthetic.pdf',
    mimeType: 'application/pdf',
    byteLength: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    uploaderId: actorId,
    uploaderName: 'Synthetic doctor',
    createdAt: '2026-10-15T00:00:00Z',
    replacesId: null,
    replacementReason: null,
  };
}
describe('historical document privileged broker', () => {
  it('accepts no renderer paths or bytes and binds selected file to patient before a fixed upload', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const picker = {
      pick: vi.fn().mockResolvedValue({
        bytes: bytes.slice(),
        filename: 'synthetic.pdf',
        mimeType: 'application/pdf',
      }),
    };
    const { broker, fetcher } = fixture(picker);
    await login(broker);
    expect(
      await broker.invoke(
        'selectHistoricalFile',
        { patientId, path: 'C:/private.pdf' },
        sender,
      ),
    ).toMatchObject({ ok: false });
    expect(picker.pick).not.toHaveBeenCalled();
    const selected = await broker.invoke(
      'selectHistoricalFile',
      { patientId },
      sender,
    );
    if (!selected.ok || !selected.data.selection)
      throw new Error('Selection failed');
    const token = selected.data.selection.token;
    const calls = fetcher.mock.calls.length;
    expect(
      await broker.invoke(
        'importHistoricalDocument',
        { ...fields, patientId: actorId, selectionToken: token },
        sender,
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(fetcher.mock.calls).toHaveLength(calls);
    fetcher.mockResolvedValue(response(metadata(token, bytes)));
    expect(
      await broker.invoke(
        'importHistoricalDocument',
        { ...fields, patientId, selectionToken: token },
        sender,
      ),
    ).toMatchObject({ ok: true, data: { id: token, patientId } });
    expect(fetcher).toHaveBeenLastCalledWith(
      `https://clinic.example/patients/${patientId}/historical-documents`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          ...fields,
          id: token,
          filename: 'synthetic.pdf',
          mimeType: 'application/pdf',
          contentBase64: Buffer.from(bytes).toString('base64'),
        }),
      }),
    );
    expect(
      await broker.invoke(
        'importHistoricalDocument',
        { ...fields, patientId, selectionToken: token },
        sender,
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
  it('drops a file picker completion after genuine session reset', async () => {
    let finish:
      | ((value: {
          bytes: Uint8Array;
          filename: string;
          mimeType: 'application/pdf';
        }) => void)
      | undefined;
    const pendingPick = new Promise<{
      bytes: Uint8Array;
      filename: string;
      mimeType: 'application/pdf';
    }>((resolve) => {
      finish = resolve;
    });
    const { broker } = fixture({ pick: () => pendingPick });
    await login(broker);
    const pending = broker.invoke(
      'selectHistoricalFile',
      { patientId },
      sender,
    );
    broker.clear('expired');
    const bytes = new Uint8Array([1, 2, 3]);
    finish?.({ bytes, filename: 'synthetic.pdf', mimeType: 'application/pdf' });
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: 'SESSION_CHANGED' },
    });
    expect([...bytes]).toEqual([0, 0, 0]);
  });
  it('drops stale upload acknowledgement before hashing erased bytes and preserves a new selection', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { broker, fetcher } = fixture({
      pick: async () => ({
        bytes: bytes.slice(),
        filename: 'synthetic.pdf',
        mimeType: 'application/pdf',
      }),
    });
    await login(broker);
    const selected = await broker.invoke(
      'selectHistoricalFile',
      { patientId },
      sender,
    );
    if (!selected.ok || !selected.data.selection)
      throw new Error('Selection failed');
    let finish: ((value: Response) => void) | undefined;
    fetcher.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = broker.invoke(
      'importHistoricalDocument',
      { ...fields, patientId, selectionToken: selected.data.selection.token },
      sender,
    );
    broker.clear('expired');
    await login(broker);
    const next = await broker.invoke(
      'selectHistoricalFile',
      { patientId },
      sender,
    );
    if (!next.ok || !next.data.selection)
      throw new Error('Next selection failed');
    finish?.(response(metadata(selected.data.selection.token, bytes)));
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: 'SESSION_CHANGED' },
    });
    fetcher.mockResolvedValue(
      response(metadata(next.data.selection.token, bytes)),
    );
    expect(
      await broker.invoke(
        'importHistoricalDocument',
        { ...fields, patientId, selectionToken: next.data.selection.token },
        sender,
      ),
    ).toMatchObject({ ok: true });
  });
  it('rejects cross-patient or corrupted content before returning bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { broker, fetcher } = fixture({ pick: async () => null });
    await login(broker);
    const id = '30000000-0000-4000-8000-000000000001';
    fetcher.mockResolvedValue(
      response({
        document: metadata(id, bytes),
        contentBase64: Buffer.from('corrupt').toString('base64'),
      }),
    );
    expect(
      await broker.invoke(
        'readHistoricalDocumentContent',
        { patientId, id },
        sender,
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } });
    fetcher.mockResolvedValue(
      response({
        document: { ...metadata(id, bytes), patientId: actorId },
        contentBase64: Buffer.from(bytes).toString('base64'),
      }),
    );
    expect(
      await broker.invoke(
        'readHistoricalDocumentContent',
        { patientId, id },
        sender,
      ),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } });
  });
});
