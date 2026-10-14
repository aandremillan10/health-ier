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
    login: async () => ok(principal),
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
