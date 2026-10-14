import { describe, expect, it, vi } from 'vitest';
import type * as Wire from '../../shared/clinic-api';
import { document, patient, principal } from '../../privileged/test-fixtures';
import { createDesktopClient } from './desktop-client';

function ok<T>(data: T): Wire.Result<T> {
  return { ok: true, data };
}
async function unused<T>(): Promise<Wire.Result<T>> {
  throw new Error('Unexpected operation');
}
function setup(): {
  wire: Wire.ClinicApi;
  reads: ReturnType<typeof vi.fn<Wire.ClinicApi['readPatient']>>;
  searches: ReturnType<typeof vi.fn<Wire.ClinicApi['searchPatients']>>;
  history: ReturnType<typeof vi.fn<Wire.ClinicApi['readDocuments']>>;
} {
  const reads = vi.fn<Wire.ClinicApi['readPatient']>(async () =>
    ok({ ...patient, fullName: 'Renamed synthetic patient' }),
  );
  const searches = vi.fn<Wire.ClinicApi['searchPatients']>(async () =>
    ok([patient]),
  );
  const history = vi.fn<Wire.ClinicApi['readDocuments']>(async () =>
    ok([document]),
  );
  const wire: Wire.ClinicApi = {
    login: async () => ok({ staff: principal, generation: 1 }),
    currentStaff: async () => ok(principal),
    logout: async () => ok({ loggedOut: true, serverRevoked: true }),
    health: unused,
    searchPatients: searches,
    readPatient: reads,
    readDocuments: history,
    createPatient: unused,
    updatePatient: unused,
    readVitals: unused,
    createVitals: unused,
    updateVitals: unused,
    finalizeVitals: unused,
    correctVitals: unused,
    readEntries: unused,
    createMedicalEntry: unused,
    updateMedicalEntry: unused,
    finalizeEntry: unused,
    correctEntry: unused,
    readCorrections: unused,
    previewDocument: unused,
    issueDocument: unused,
    readDocument: async () => ok(document),
    listPrinters: unused,
    printDocument: unused,
    onSessionReset: () => () => undefined,
  };
  return { wire, reads, searches, history };
}
describe('desktop renderer adapter reads', () => {
  it('opens a current identity directly from a fresh client, without a cached-name search', async () => {
    const { wire, reads, searches } = setup();
    const client = createDesktopClient(wire);
    expect(await client.getPatient({ id: patient.id })).toMatchObject({
      ok: true,
      data: { id: patient.id, fullName: 'Renamed synthetic patient' },
    });
    expect(reads).toHaveBeenCalledExactlyOnceWith({ id: patient.id });
    expect(searches).not.toHaveBeenCalled();
    expect(await client.findPatients({ search: patient.id })).toMatchObject({
      ok: true,
      data: [{ id: patient.id }],
    });
    expect(searches).toHaveBeenCalledExactlyOnceWith({ search: patient.id });
  });
  it('reads persisted history after logout/fresh client and preserves failed versus empty history', async () => {
    const { wire, history } = setup();
    const first = createDesktopClient(wire);
    await first.getDocument({ id: document.id });
    await first.logout();
    const fresh = createDesktopClient(wire);
    expect(await fresh.listDocuments({ patientId: patient.id })).toMatchObject({
      ok: true,
      data: [
        {
          id: document.id,
          issuer: { displayName: document.snapshot.issuer.displayName },
        },
      ],
    });
    history.mockResolvedValueOnce({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Denied history' },
    });
    expect(await fresh.listDocuments({ patientId: patient.id })).toEqual({
      ok: false,
      error: {
        code: 'DENIED',
        message: 'Denied history',
        fieldErrors: undefined,
        latestRevision: undefined,
      },
    });
    history.mockResolvedValueOnce(ok([]));
    expect(await fresh.listDocuments({ patientId: patient.id })).toEqual({
      ok: true,
      data: [],
    });
    expect(history).toHaveBeenCalledTimes(3);
  });
  it('preserves server author names and correction attribution for another clinician', async () => {
    const { wire: initialWire } = setup();
    const entry: Wire.Entry = {
      id: document.consultationId,
      patientId: patient.id,
      authorId: principal.id,
      authorName: 'Actual historical author',
      status: 'finalized',
      revision: 3,
      createdAt: patient.createdAt,
      updatedAt: patient.updatedAt,
      discipline: 'medical',
      consultationDate: '2026-10-15',
      ageAtConsultation: null,
      cs: null,
      vitalsId: null,
      reason: null,
      findings: 'Preserved original',
      clinicalImpression: null,
      plan: null,
      text: null,
    };
    const wire: Wire.ClinicApi = {
      ...initialWire,
      readEntries: async () => ok([entry]),
      readCorrections: async () =>
        ok([
          {
            id: document.id,
            originalEntryId: entry.id,
            authorId: entry.authorId,
            authorName: entry.authorName,
            reason: 'Actual correction reason',
            correctedContent: { findings: 'Corrected finding' },
            createdAt: patient.createdAt,
            sourceRevision: 2,
            originalType: 'entry',
            revision: 1,
          },
        ]),
    };
    const response = await createDesktopClient(wire).listEntries({
      patientId: patient.id,
      discipline: 'medical',
    });
    expect(response).toMatchObject({
      ok: true,
      data: [
        {
          authorName: entry.authorName,
          findings: 'Preserved original',
          corrections: [
            {
              authorName: entry.authorName,
              sourceRevision: 2,
              reason: 'Actual correction reason',
            },
          ],
        },
      ],
    });
  });
});

function sessionSetup(): {
  client: ReturnType<typeof createDesktopClient>;
  login: ReturnType<typeof vi.fn<Wire.ClinicApi['login']>>;
  emit: (event: Wire.SessionReset) => void;
  wireUnsubscribe: ReturnType<typeof vi.fn>;
  resets: ReturnType<typeof vi.fn>;
  unsubscribe: () => void;
} {
  const base = setup().wire;
  const login = vi.fn<Wire.ClinicApi['login']>(async () =>
    ok({ staff: principal, generation: 1 }),
  );
  let receive: ((event: Wire.SessionReset) => void) | undefined;
  const wireUnsubscribe = vi.fn(() => {
    receive = undefined;
  });
  const client = createDesktopClient({
    ...base,
    login,
    onSessionReset: (listener) => {
      receive = listener;
      return wireUnsubscribe;
    },
  });
  const resets = vi.fn();
  const unsubscribe = client.onSessionReset!(resets);
  return {
    client,
    login,
    emit: (event): void => receive?.(event),
    wireUnsubscribe,
    resets,
    unsubscribe,
  };
}
function pending<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const credentials = { username: 'synthetic', password: 'synthetic' };
describe('desktop session generation correlation', () => {
  it('accepts a newer login after an old logout arrives while pending', async () => {
    const { client, login, emit, resets } = sessionSetup();
    login.mockImplementationOnce(async () => {
      emit({ generation: 2, reason: 'logout' });
      return ok({ staff: principal, generation: 3 });
    });
    expect(await client.login(credentials)).toEqual({
      ok: true,
      data: principal,
    });
    expect(resets).not.toHaveBeenCalled();
  });
  it('rejects a same-generation expiry during pending login', async () => {
    const { client, login, emit, resets } = sessionSetup();
    login.mockImplementationOnce(async () => {
      emit({ generation: 3, reason: 'expired' });
      return ok({ staff: principal, generation: 3 });
    });
    expect(await client.login(credentials)).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(resets).toHaveBeenCalledExactlyOnceWith('expired');
  });
  it('rejects a malformed authoritative generation', async () => {
    const { client, login } = sessionSetup();
    login.mockResolvedValueOnce(ok({ staff: principal, generation: 1.5 }));
    expect(await client.login(credentials)).toMatchObject({
      ok: false,
      error: { code: 'UNAVAILABLE' },
    });
  });
  it.each(['before', 'after'] as const)(
    'keeps successful sign-in when its account-switch reset arrives %s the response',
    async (order) => {
      const { client, login, emit, resets, unsubscribe, wireUnsubscribe } =
        sessionSetup();
      login.mockImplementation(async () => {
        if (order === 'before')
          emit({ generation: 5, reason: 'account-switch' });
        return ok({ staff: principal, generation: 5 });
      });
      expect(await client.login(credentials)).toEqual({
        ok: true,
        data: principal,
      });
      if (order === 'after') emit({ generation: 5, reason: 'account-switch' });
      expect(resets).not.toHaveBeenCalled();
      unsubscribe();
      expect(wireUnsubscribe).toHaveBeenCalledOnce();
    },
  );
  it.each(['expired', 'logout', 'account-switch'] as const)(
    'rejects a stale login after a newer %s while it was pending',
    async (reason) => {
      const { client, login, emit, resets } = sessionSetup();
      const waiting = pending<Wire.Result<Wire.Responses['login']>>();
      login.mockReturnValue(waiting.promise);
      const signingIn = client.login(credentials);
      emit({ generation: 6, reason });
      waiting.resolve(ok({ staff: principal, generation: 5 }));
      expect(await signingIn).toMatchObject({
        ok: false,
        error: { code: 'UNAUTHENTICATED' },
      });
      expect(resets).toHaveBeenCalledWith(reason);
    },
  );
  it.each(['expired', 'logout', 'account-switch'] as const)(
    'forwards a genuine newer %s after successful sign-in',
    async (reason) => {
      const { client, emit, resets } = sessionSetup();
      expect(await client.login(credentials)).toEqual({
        ok: true,
        data: principal,
      });
      emit({ generation: 2, reason });
      expect(resets).toHaveBeenCalledExactlyOnceWith(reason);
    },
  );
  it('ignores provably old logout/reset events after a newer successful session', async () => {
    const { client, login, emit, resets } = sessionSetup();
    login.mockResolvedValue(ok({ staff: principal, generation: 10 }));
    await client.login(credentials);
    emit({ generation: 9, reason: 'logout' });
    emit({ generation: 10, reason: 'account-switch' });
    expect(resets).not.toHaveBeenCalled();
    emit({ generation: 11, reason: 'expired' });
    emit({ generation: 10, reason: 'account-switch' });
    expect(resets).toHaveBeenCalledExactlyOnceWith('expired');
  });
  it('does not consume a future reset after validation fails without a reset event', async () => {
    const { client, login, emit, resets } = sessionSetup();
    login.mockResolvedValueOnce({
      ok: false,
      error: { code: 'VALIDATION', message: 'Invalid sign-in input' },
    });
    expect(await client.login(credentials)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    emit({ generation: 1, reason: 'account-switch' });
    expect(resets).toHaveBeenCalledExactlyOnceWith('account-switch');
    login.mockResolvedValueOnce(ok({ staff: principal, generation: 2 }));
    expect(await client.login(credentials)).toEqual({
      ok: true,
      data: principal,
    });
  });
  it('forwards the replacement reset when sign-in fails and retains no prior session result', async () => {
    const { client, login, emit, resets } = sessionSetup();
    await client.login(credentials);
    login.mockImplementationOnce(async () => {
      emit({ generation: 2, reason: 'account-switch' });
      return {
        ok: false,
        error: { code: 'UNAUTHENTICATED', message: 'Sign-in failed' },
      };
    });
    expect(await client.login(credentials)).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(resets).toHaveBeenCalledExactlyOnceWith('account-switch');
  });
  it('rejects an old success after a newer login and preserves the newer generation', async () => {
    const { client, login, emit, resets } = sessionSetup();
    const older = pending<Wire.Result<Wire.Responses['login']>>();
    login.mockReturnValueOnce(older.promise).mockResolvedValueOnce(
      ok({
        staff: { ...principal, displayName: 'New synthetic staff' },
        generation: 2,
      }),
    );
    const first = client.login(credentials);
    expect(await client.login(credentials)).toMatchObject({
      ok: true,
      data: { displayName: 'New synthetic staff' },
    });
    older.resolve(ok({ staff: principal, generation: 1 }));
    expect(await first).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    emit({ generation: 1, reason: 'account-switch' });
    expect(resets).not.toHaveBeenCalled();
    emit({ generation: 3, reason: 'expired' });
    expect(resets).toHaveBeenCalledExactlyOnceWith('expired');
  });
  it('rejects login superseded by logout and ignores delayed logout after rapid relogin', async () => {
    const { client, login, emit, resets } = sessionSetup();
    const older = pending<Wire.Result<Wire.Responses['login']>>();
    login
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(ok({ staff: principal, generation: 3 }));
    const first = client.login(credentials);
    await client.logout();
    expect(await client.login(credentials)).toEqual({
      ok: true,
      data: principal,
    });
    older.resolve(ok({ staff: principal, generation: 1 }));
    expect(await first).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    emit({ generation: 2, reason: 'logout' });
    expect(resets).not.toHaveBeenCalled();
    emit({ generation: 4, reason: 'expired' });
    expect(resets).toHaveBeenCalledExactlyOnceWith('expired');
  });
  it('cleans its wire listener after pending sign-in settles following unsubscribe', async () => {
    const { client, login, emit, resets, unsubscribe, wireUnsubscribe } =
      sessionSetup();
    const waiting = pending<Wire.Result<Wire.Responses['login']>>();
    login.mockReturnValue(waiting.promise);
    const signingIn = client.login(credentials);
    unsubscribe();
    emit({ generation: 1, reason: 'account-switch' });
    waiting.resolve(ok({ staff: principal, generation: 1 }));
    await signingIn;
    expect(resets).not.toHaveBeenCalled();
    expect(wireUnsubscribe).toHaveBeenCalledOnce();
  });
});
