import { describe, expect, it, vi } from 'vitest';
import {
  ClinicBroker,
  serverOrigin,
  type BrokerOptions,
  type RequestSender,
} from './broker';
import type { Requests, SessionReset } from '../shared/clinic-api';
import { document, ids, instant, patient, principal } from './test-fixtures';
import { requestGuards } from './contracts';

const sender: RequestSender = {
  senderId: 7,
  isMainFrame: true,
  url: 'file:///app/index.html',
};
const loginData = {
  staff: principal,
  token: 'opaque_session_token_synthetic',
  expiresAt: '2099-10-14T00:00:00.000Z',
};
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done): void => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(overrides: Partial<BrokerOptions> = {}): {
  broker: ClinicBroker;
  fetcher: ReturnType<typeof vi.fn<BrokerOptions['fetch']>>;
  resets: SessionReset[];
  printer: BrokerOptions['printer'];
} {
  const fetcher = vi.fn<BrokerOptions['fetch']>(async (): Promise<Response> =>
    json(loginData),
  );
  const resets: SessionReset[] = [];
  const printer = {
    listPrinters: vi.fn(async () => [
      { name: 'Office', displayName: 'Office' },
    ]),
    print: vi.fn(async (): Promise<void> => undefined),
    cancel: vi.fn(),
  };
  const broker = new ClinicBroker({
    serverUrl: 'https://clinic.example:3000',
    allowSyntheticHttp: false,
    packaged: true,
    rendererUrl: sender.url,
    senderId: 7,
    fetch: fetcher,
    reset: (event): void => {
      resets.push(event);
    },
    printer,
    ...overrides,
  });
  return { broker, fetcher, resets, printer };
}
async function login(broker: ClinicBroker): Promise<void> {
  expect(
    await broker.invoke(
      'login',
      { username: 'doctor', password: 'synthetic' },
      sender,
    ),
  ).toEqual({ ok: true, data: { staff: principal, generation: 1 } });
}
function expectCode(result: unknown, code: string): void {
  expect(result).toMatchObject({ ok: false, error: { code } });
}
describe('Electron clinic broker boundary', () => {
  it.each([1001, 4000])(
    'preserves a %i-character correction reason in medical and vitals history',
    async (length) => {
      const { broker, fetcher } = setup();
      await login(broker);
      const reason = 'R'.repeat(length);
      const correction = {
        id: ids.document,
        originalEntryId: ids.entry,
        authorId: ids.staff,
        authorName: principal.displayName,
        reason,
        createdAt: instant,
        sourceRevision: 1,
        revision: 1,
      };
      const medicalCorrection = {
        ...correction,
        originalType: 'entry',
        correctedContent: { findings: 'Synthetic corrected finding' },
      };
      fetcher.mockResolvedValue(json([medicalCorrection]));
      expect(
        await broker.invoke('readCorrections', { id: ids.entry }, sender),
      ).toEqual({ ok: true, data: [medicalCorrection] });
      const history = {
        id: ids.entry,
        patientId: ids.patient,
        authorId: ids.staff,
        authorName: principal.displayName,
        status: 'finalized',
        revision: 2,
        createdAt: instant,
        updatedAt: instant,
        recordedAt: instant,
        systolic: null,
        diastolic: null,
        temperature: null,
        pulse: null,
        respiratoryRate: null,
        oxygenSaturation: null,
        weight: null,
        height: null,
        corrections: [
          {
            ...correction,
            originalType: 'vitals',
            correctedContent: { pulse: 72 },
          },
        ],
      };
      fetcher.mockResolvedValue(json([history]));
      expect(
        await broker.invoke('readVitals', { patientId: ids.patient }, sender),
      ).toEqual({ ok: true, data: [history] });
    },
  );
  it.each([1001, 4000])(
    'accepts a %i-character reason when submitting either correction type',
    (length) => {
      const reason = 'R'.repeat(length);
      const base = { id: ids.entry, expectedRevision: 1, reason };
      expect(
        requestGuards.correctEntry({
          ...base,
          correctedContent: { findings: 'Synthetic correction' },
        }).reason,
      ).toBe(reason);
      expect(
        requestGuards.correctVitals({
          ...base,
          correctedContent: { pulse: 72 },
        }).reason,
      ).toBe(reason);
    },
  );
  it('rejects correction reasons over the server limit before network access', async () => {
    const { broker, fetcher } = setup();
    await login(broker);
    fetcher.mockClear();
    const base = {
      id: ids.entry,
      expectedRevision: 1,
      reason: 'R'.repeat(4001),
    };
    expectCode(
      await broker.invoke(
        'correctEntry',
        { ...base, correctedContent: { findings: 'Synthetic correction' } },
        sender,
      ),
      'VALIDATION',
    );
    expectCode(
      await broker.invoke(
        'correctVitals',
        { ...base, correctedContent: { pulse: 72 } },
        sender,
      ),
      'VALIDATION',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('maps patient identity and persisted history through fixed routes and rejects cross-patient responses', async () => {
    const { broker, fetcher } = setup();
    await login(broker);
    fetcher.mockResolvedValue(json(patient));
    expect(
      await broker.invoke('readPatient', { id: ids.patient }, sender),
    ).toEqual({ ok: true, data: patient });
    expect(fetcher.mock.lastCall?.[0]).toBe(
      `https://clinic.example:3000/patients/${ids.patient}`,
    );
    fetcher.mockResolvedValue(json([document]));
    expect(
      await broker.invoke('readDocuments', { patientId: ids.patient }, sender),
    ).toEqual({ ok: true, data: [document] });
    expect(fetcher.mock.lastCall?.[0]).toBe(
      `https://clinic.example:3000/patients/${ids.patient}/documents`,
    );
    fetcher.mockResolvedValue(json([document]));
    expectCode(
      await broker.invoke('readDocuments', { patientId: ids.entry }, sender),
      'INVALID_RESPONSE',
    );
    fetcher.mockResolvedValue(json({ ...patient, id: ids.entry }));
    expectCode(
      await broker.invoke('readPatient', { id: ids.patient }, sender),
      'INVALID_RESPONSE',
    );
  });
  it('filters single patient identity for medtech and rejects broader payloads', async () => {
    const { broker, fetcher } = setup();
    fetcher.mockResolvedValue(
      json({ ...loginData, staff: { ...principal, role: 'medtech' } }),
    );
    await broker.invoke(
      'login',
      { username: 'medtech', password: 'synthetic' },
      sender,
    );
    const minimum = {
      id: patient.id,
      revision: patient.revision,
      fullName: patient.fullName,
      sex: patient.sex,
      dateOfBirth: patient.dateOfBirth,
    };
    fetcher.mockResolvedValue(json(minimum));
    expect(
      await broker.invoke('readPatient', { id: ids.patient }, sender),
    ).toEqual({ ok: true, data: minimum });
    fetcher.mockResolvedValue(json(patient));
    expectCode(
      await broker.invoke('readPatient', { id: ids.patient }, sender),
      'INVALID_RESPONSE',
    );
    fetcher.mockClear();
    expectCode(
      await broker.invoke('readPatient', { id: '../auth/me' }, sender),
      'VALIDATION',
    );
    expectCode(
      await broker.invoke(
        'readDocuments',
        { patientId: ids.patient, url: '/auth/me' },
        sender,
      ),
      'VALIDATION',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('accepts trusted HTTPS and only an explicitly opted-in unpackaged synthetic loopback HTTP origin', () => {
    expect(serverOrigin('https://clinic.example:3000', false, true)).toBe(
      'https://clinic.example:3000',
    );
    expect(serverOrigin('http://127.0.0.1:3000', true, false)).toBe(
      'http://127.0.0.1:3000',
    );
    for (const url of [
      'http://clinic.example',
      'file:///app',
      'https://user:pass@clinic.example',
      'https://clinic.example/api',
      'https://clinic.example/?secret=yes',
      'https://clinic.example/#fragment',
    ])
      expect(() => serverOrigin(url, true, false)).toThrow();
    expect(() => serverOrigin('http://127.0.0.1:3000', true, true)).toThrow();
    expect(() => serverOrigin('http://localhost:3000', false, false)).toThrow();
  });
  it('rejects another window, subframe, lookalike URL, file path, and unknown operation before network access', async () => {
    const { broker, fetcher } = setup();
    for (const attacker of [
      { ...sender, senderId: 8 },
      { ...sender, isMainFrame: false },
      { ...sender, url: `${sender.url}?x=1` },
      { ...sender, url: 'file:///other/index.html' },
      { ...sender, url: 'https://evil.example' },
    ])
      expectCode(
        await broker.invoke(
          'login',
          { username: 'x', password: 'x' },
          attacker,
        ),
        'FORBIDDEN',
      );
    expectCode(
      await broker.invoke(
        'request' as keyof Requests,
        { url: 'https://evil.example' },
        sender,
      ),
      'FORBIDDEN',
    );
    expectCode(
      await broker.invoke('__proto__' as keyof Requests, undefined, sender),
      'FORBIDDEN',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects authority fields, arbitrary URLs, traversal IDs, invalid numeric values, and inherited fields', async () => {
    const { broker, fetcher } = setup();
    for (const payload of [
      { username: 'x', password: 'x', role: 'doctor' },
      { username: 'x', password: 'x', url: 'https://evil.example' },
      { username: '', password: 'x' },
      Object.create({ username: 'x', password: 'x' }) as unknown,
    ])
      expectCode(await broker.invoke('login', payload, sender), 'VALIDATION');
    expectCode(
      await broker.invoke('readDocument', { id: '../auth/me' }, sender),
      'VALIDATION',
    );
    expectCode(
      await broker.invoke(
        'printDocument',
        {
          documentId: ids.document,
          printerName: 'Office',
          copies: NaN,
          duplexMode: 'simplex',
        },
        sender,
      ),
      'VALIDATION',
    );
    expectCode(
      await broker.invoke(
        'createVitals',
        { patientId: ids.patient, systolic: Infinity },
        sender,
      ),
      'VALIDATION',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('returns the principal without tokens and sends only fixed routes, Bearer auth, and no cookies or redirects', async () => {
    const { broker, fetcher } = setup();
    await login(broker);
    fetcher.mockResolvedValue(json([patient]));
    expect(
      await broker.invoke(
        'searchPatients',
        { search: 'A&B?#/ https://evil.example' },
        sender,
      ),
    ).toEqual({ ok: true, data: [patient] });
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://clinic.example:3000/patients?search=A%26B%3F%23%2F%20https%3A%2F%2Fevil.example',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
        headers: expect.objectContaining({
          Authorization: `Bearer ${loginData.token}`,
        }),
      }),
    );
    const restarted = setup();
    expectCode(
      await restarted.broker.invoke('currentStaff', undefined, sender),
      'UNAUTHENTICATED',
    );
    expect(restarted.fetcher).not.toHaveBeenCalled();
  });
  it('clears the token/cache signal and blocks protected reads after logout despite server failure', async () => {
    const { broker, fetcher, resets } = setup();
    await login(broker);
    fetcher.mockRejectedValue(new Error('synthetic network failure'));
    expect(await broker.invoke('logout', undefined, sender)).toEqual({
      ok: true,
      data: { loggedOut: true, serverRevoked: false },
    });
    expect(resets.at(-1)?.reason).toBe('logout');
    expectCode(
      await broker.invoke('searchPatients', { search: '' }, sender),
      'UNAUTHENTICATED',
    );
  });
  it('revokes logout with the captured token and clears cache before awaiting revocation', async () => {
    const { broker, fetcher, resets } = setup();
    await login(broker);
    const waiting = deferred<Response>();
    fetcher.mockReturnValue(waiting.promise);
    const request = broker.invoke('logout', undefined, sender);
    expect(resets.at(-1)?.reason).toBe('logout');
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://clinic.example:3000/auth/logout',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${loginData.token}`,
        }),
      }),
    );
    waiting.resolve(json({ loggedOut: true }));
    expect(await request).toEqual({
      ok: true,
      data: { loggedOut: true, serverRevoked: true },
    });
  });
  it('does not claim server revocation after an invalid logout acknowledgement', async () => {
    const { broker, fetcher } = setup();
    await login(broker);
    fetcher.mockResolvedValue(json({ loggedOut: false }));
    expect(await broker.invoke('logout', undefined, sender)).toEqual({
      ok: true,
      data: { loggedOut: true, serverRevoked: false },
    });
    expectCode(
      await broker.invoke('currentStaff', undefined, sender),
      'UNAUTHENTICATED',
    );
  });
  it('drops authorized responses in flight when logout or account switch occurs', async () => {
    for (const change of ['logout', 'login'] as const) {
      const { broker, fetcher } = setup();
      await login(broker);
      const waiting = deferred<Response>();
      fetcher.mockReturnValueOnce(waiting.promise);
      const pending = broker.invoke('searchPatients', { search: '' }, sender);
      fetcher.mockResolvedValue(
        json(change === 'login' ? loginData : { loggedOut: true }),
      );
      await broker.invoke(
        change,
        change === 'login'
          ? { username: 'other', password: 'synthetic' }
          : undefined,
        sender,
      );
      waiting.resolve(json([patient]));
      expectCode(await pending, 'SESSION_CHANGED');
    }
  });
  it('drops and revokes a stale login that completes after logout', async () => {
    const { broker, fetcher } = setup();
    const waiting = deferred<Response>();
    fetcher.mockReturnValueOnce(waiting.promise);
    const pending = broker.invoke(
      'login',
      { username: 'doctor', password: 'synthetic' },
      sender,
    );
    await broker.invoke('logout', undefined, sender);
    fetcher.mockResolvedValue(json({ loggedOut: true }));
    waiting.resolve(json(loginData));
    expectCode(await pending, 'SESSION_CHANGED');
    expectCode(
      await broker.invoke('currentStaff', undefined, sender),
      'UNAUTHENTICATED',
    );
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://clinic.example:3000/auth/logout',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${loginData.token}`,
        }),
      }),
    );
  });
  it('invalidates expired sessions and never returns restricted server error text', async () => {
    const { broker, fetcher, resets } = setup();
    await login(broker);
    fetcher.mockResolvedValue(
      json(
        {
          code: 'expired',
          message: 'restricted clinical note',
          token: loginData.token,
        },
        401,
      ),
    );
    expectCode(
      await broker.invoke('currentStaff', undefined, sender),
      'UNAUTHENTICATED',
    );
    expect(resets.at(-1)?.reason).toBe('expired');
    expectCode(
      await broker.invoke('currentStaff', undefined, sender),
      'UNAUTHENTICATED',
    );
  });
  it('rejects unexpected identity, redirects, non-JSON, nested extra fields, and overbroad medtech patient DTOs', async () => {
    const { broker, fetcher } = setup();
    await login(broker);
    const redirected = json(principal);
    Object.defineProperty(redirected, 'url', {
      value: 'https://evil.example/auth/me',
    });
    for (const response of [
      redirected,
      new Response('not json'),
      json({ ...principal, token: loginData.token }),
      json({ ...principal, id: ids.patient }),
    ]) {
      fetcher.mockResolvedValue(response);
      expect((await broker.invoke('currentStaff', undefined, sender)).ok).toBe(
        false,
      );
    }
    const medtech = setup();
    medtech.fetcher.mockResolvedValue(
      json({ ...loginData, staff: { ...principal, role: 'medtech' } }),
    );
    expect(
      (
        await medtech.broker.invoke(
          'login',
          { username: 'lab', password: 'synthetic' },
          sender,
        )
      ).ok,
    ).toBe(true);
    medtech.fetcher.mockResolvedValue(json([patient]));
    expectCode(
      await medtech.broker.invoke('searchPatients', { search: '' }, sender),
      'INVALID_RESPONSE',
    );
    medtech.fetcher.mockResolvedValue(
      json([
        {
          id: patient.id,
          revision: 1,
          fullName: patient.fullName,
          sex: null,
          dateOfBirth: null,
        },
      ]),
    );
    expect(
      (await medtech.broker.invoke('searchPatients', { search: '' }, sender))
        .ok,
    ).toBe(true);
  });
  it('reports network failure without save success and requires fresh login after window close', async () => {
    const { broker, fetcher } = setup();
    await login(broker);
    fetcher.mockRejectedValue(new Error('connection refused'));
    expectCode(
      await broker.invoke(
        'createPatient',
        {
          fullName: 'Synthetic',
          sex: null,
          address: null,
          patientCategory: null,
          employeeIdentifier: null,
          dateOfBirth: null,
        },
        sender,
      ),
      'UNAVAILABLE',
    );
    broker.clear('window-closed');
    expectCode(
      await broker.invoke('currentStaff', undefined, sender),
      'UNAUTHENTICATED',
    );
  });
  it('preserves only validated field keys and authorized stale revisions, with safe messages', async () => {
    const { broker, fetcher } = setup();
    await login(broker);
    fetcher.mockResolvedValue(
      json(
        {
          code: 'VALIDATION',
          message: 'restricted note',
          fieldErrors: {
            address: 'restricted content',
            passwordHash: 'secret',
          },
        },
        400,
      ),
    );
    const invalid = await broker.invoke(
      'updatePatient',
      { id: ids.patient, expectedRevision: 1, address: 'Synthetic' },
      sender,
    );
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { address: 'Invalid value.' } },
    });
    expect(JSON.stringify(invalid)).not.toMatch(
      /restricted|secret|passwordHash/,
    );
    fetcher.mockResolvedValue(
      json(
        {
          code: 'STALE_REVISION',
          currentRevision: 7,
          message: 'restricted note',
        },
        409,
      ),
    );
    expect(
      await broker.invoke(
        'updatePatient',
        { id: ids.patient, expectedRevision: 1, address: 'Synthetic' },
        sender,
      ),
    ).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', currentRevision: 7 },
    });
    fetcher.mockResolvedValue(
      json({ code: 'STALE_REVISION', currentRevision: 7 }, 403),
    );
    expect(
      await broker.invoke(
        'updatePatient',
        { id: ids.patient, expectedRevision: 1, address: 'Synthetic' },
        sender,
      ),
    ).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'This operation is not permitted.' },
    });
  });
  it('authorizes reprint by immutable document ID, lists installed printers, and reports submission distinctly', async () => {
    const { broker, fetcher, printer } = setup();
    await login(broker);
    fetcher.mockImplementation(async (url): Promise<Response> =>
      json(
        String(url).endsWith('/audit-events/print')
          ? { recorded: true }
          : document,
      ),
    );
    const options = {
      documentId: ids.document,
      printerName: 'Office',
      copies: 1,
      duplexMode: 'simplex',
    } satisfies Requests['printDocument'];
    expect(await broker.invoke('printDocument', options, sender)).toEqual({
      ok: true,
      data: { documentId: ids.document, submitted: true },
    });
    expect(fetcher).toHaveBeenCalledWith(
      `https://clinic.example:3000/documents/${ids.document}`,
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://clinic.example:3000/audit-events/print',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ documentId: ids.document, outcome: 'success' }),
      }),
    );
    expect(printer.print).toHaveBeenCalledWith(
      document,
      options,
      expect.any(Function),
    );
    expectCode(
      await broker.invoke(
        'printDocument',
        { ...options, printerName: 'arbitrary' },
        sender,
      ),
      'PRINTER_UNAVAILABLE',
    );
    fetcher.mockResolvedValue(json({ message: 'denied' }, 403));
    expectCode(
      await broker.invoke('printDocument', options, sender),
      'FORBIDDEN',
    );
    expect(printer.print).toHaveBeenCalledTimes(1);
  });
  it('does not submit a document whose authorization response became stale', async () => {
    const { broker, fetcher, printer } = setup();
    await login(broker);
    const waiting = deferred<Response>();
    fetcher.mockReturnValueOnce(waiting.promise);
    const pending = broker.invoke(
      'printDocument',
      {
        documentId: ids.document,
        printerName: 'Office',
        copies: 1,
        duplexMode: 'simplex',
      },
      sender,
    );
    fetcher.mockResolvedValue(json({ loggedOut: true }));
    await broker.invoke('logout', undefined, sender);
    waiting.resolve(json(document));
    expectCode(await pending, 'SESSION_CHANGED');
    expect(printer.print).not.toHaveBeenCalled();
  });
  it('maps the clinical lifecycle operations to exact fixed routes and removes routing IDs from bodies', async () => {
    const { broker, fetcher } = setup();
    await login(broker);
    const measurements = {
      systolic: null,
      diastolic: null,
      temperature: null,
      pulse: null,
      respiratoryRate: null,
      oxygenSaturation: null,
      weight: null,
      height: null,
    };
    const medical = {
      consultationDate: '2026-10-14',
      ageAtConsultation: null,
      cs: null,
      vitalsId: null,
      reason: null,
      findings: null,
      clinicalImpression: null,
      plan: null,
    };
    const authored = {
      id: ids.entry,
      patientId: ids.patient,
      authorId: ids.staff,
      authorName: principal.displayName,
      status: 'draft',
      revision: 1,
      createdAt: instant,
      updatedAt: instant,
    };
    const vitals = { ...authored, ...measurements, recordedAt: instant };
    const entry = {
      ...authored,
      ...medical,
      discipline: 'medical',
      text: null,
    };
    const docInput = {
      kind: 'prescription',
      consultationId: ids.entry,
      expectedRevision: 1,
      body: 'Synthetic instructions',
    };
    const cases: [keyof Requests, unknown, string, string, unknown][] = [
      [
        'createPatient',
        {
          fullName: 'Synthetic',
          sex: null,
          address: null,
          patientCategory: null,
          employeeIdentifier: null,
          dateOfBirth: null,
        },
        '/patients',
        'POST',
        patient,
      ],
      [
        'updatePatient',
        { id: ids.patient, expectedRevision: 1, address: 'Synthetic' },
        `/patients/${ids.patient}`,
        'PATCH',
        patient,
      ],
      [
        'readVitals',
        { patientId: ids.patient },
        `/patients/${ids.patient}/vitals`,
        'GET',
        [{ ...vitals, corrections: [] }],
      ],
      [
        'createVitals',
        { patientId: ids.patient, ...measurements },
        `/patients/${ids.patient}/vitals`,
        'POST',
        vitals,
      ],
      [
        'updateVitals',
        { id: ids.entry, expectedRevision: 1, pulse: 60 },
        `/vitals/${ids.entry}`,
        'PATCH',
        vitals,
      ],
      [
        'finalizeVitals',
        { id: ids.entry, expectedRevision: 1 },
        `/vitals/${ids.entry}/finalize`,
        'POST',
        vitals,
      ],
      [
        'readEntries',
        { patientId: ids.patient, discipline: 'medical' },
        `/patients/${ids.patient}/charts/medical/entries`,
        'GET',
        [entry],
      ],
      [
        'createMedicalEntry',
        { patientId: ids.patient, ...medical },
        `/patients/${ids.patient}/charts/medical/entries`,
        'POST',
        entry,
      ],
      [
        'updateMedicalEntry',
        { id: ids.entry, expectedRevision: 1, findings: 'Synthetic' },
        `/entries/${ids.entry}`,
        'PATCH',
        entry,
      ],
      [
        'finalizeEntry',
        { id: ids.entry, expectedRevision: 1 },
        `/entries/${ids.entry}/finalize`,
        'POST',
        entry,
      ],
      [
        'readCorrections',
        { id: ids.entry },
        `/entries/${ids.entry}/corrections`,
        'GET',
        [],
      ],
      [
        'previewDocument',
        docInput,
        '/documents/preview',
        'POST',
        Object.fromEntries(
          Object.entries(document).filter(
            ([key]) => !['id', 'revision', 'createdAt'].includes(key),
          ),
        ),
      ],
      ['issueDocument', docInput, '/documents', 'POST', document],
      [
        'readDocument',
        { id: ids.document },
        `/documents/${ids.document}`,
        'GET',
        document,
      ],
    ];
    for (const [name, payload, path, method, output] of cases) {
      fetcher.mockResolvedValue(json(output));
      expect((await broker.invoke(name, payload, sender)).ok, name).toBe(true);
      expect(fetcher).toHaveBeenLastCalledWith(
        `https://clinic.example:3000${path}`,
        expect.objectContaining({ method }),
      );
      const body = fetcher.mock.calls.at(-1)?.[1].body;
      if (typeof body === 'string') {
        expect(JSON.parse(body)).not.toHaveProperty('id');
        expect(JSON.parse(body)).not.toHaveProperty('patientId');
      }
    }
  });
});
