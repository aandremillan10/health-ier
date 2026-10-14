import type * as Wire from '../../shared/clinic-api';
import type {
  ClinicApi,
  ClinicDocument,
  Correction,
  DocumentInput,
  Entry,
  Patient,
  PatientInput,
  Result,
  Vitals,
} from './contract';

// The renderer view model also serves the explicit demo; only named preload calls cross this seam.
export function createDesktopClient(wire: Wire.ClinicApi): ClinicApi {
  async function result<A, B>(
    operation: Promise<Wire.Result<A>>,
    convert: (data: A) => B,
  ): Promise<Result<B>> {
    const response = await operation;
    if (response.ok) return { ok: true, data: convert(response.data) };
    const error = response.error;
    const code =
      error.code === 'FORBIDDEN'
        ? 'DENIED'
        : error.code === 'SESSION_CHANGED'
          ? 'UNAUTHENTICATED'
          : ['VALIDATION', 'UNAUTHENTICATED', 'NOT_FOUND', 'CONFLICT'].includes(
                error.code,
              )
            ? (error.code as
                'VALIDATION' | 'UNAUTHENTICATED' | 'NOT_FOUND' | 'CONFLICT')
            : 'UNAVAILABLE';
    return {
      ok: false,
      error: {
        code,
        message: error.message,
        fieldErrors: error.fieldErrors,
        latestRevision: error.currentRevision,
      },
    };
  }
  function patient(data: Wire.Patient | Wire.PatientIdentity): Patient {
    const mapped: Patient = {
      id: data.id,
      revision: data.revision,
      fullName: data.fullName,
      dateOfBirth: data.dateOfBirth,
      sex: data.sex ?? 'unknown',
      address: 'address' in data ? (data.address ?? '') : '',
      patientCategory:
        'patientCategory' in data
          ? (data.patientCategory ?? 'unknown')
          : 'unknown',
      employeeIdentifier:
        'employeeIdentifier' in data ? (data.employeeIdentifier ?? '') : '',
    };
    return mapped;
  }
  function fields(input: PatientInput): Wire.PatientFields {
    return {
      ...input,
      sex: input.sex === 'unknown' ? null : input.sex,
      patientCategory:
        input.patientCategory === 'unknown' ? null : input.patientCategory,
      address: input.address || null,
      employeeIdentifier: input.employeeIdentifier || null,
    };
  }
  function correction(
    data: Wire.Correction<
      Wire.MedicalFields | Wire.VitalsFields | { text: string | null }
    >,
  ): Correction {
    return {
      ...data,
      authorName: data.authorName,
      correctedContent: { ...data.correctedContent },
    };
  }
  function vitals(
    data: Wire.Vitals & { corrections?: Wire.Correction<Wire.VitalsFields>[] },
  ): Vitals {
    return {
      ...data,
      authorName: data.authorName,
      corrections: data.corrections?.map(correction) ?? [],
    };
  }
  function entry(data: Wire.Entry, corrections: Correction[] = []): Entry {
    return {
      ...data,
      consultationDate: data.consultationDate ?? data.createdAt.slice(0, 10),
      cs: data.cs ?? '',
      reason: data.reason ?? data.text ?? '',
      findings: data.findings ?? '',
      clinicalImpression: data.clinicalImpression ?? '',
      plan: data.plan ?? '',
      authorName: data.authorName,
      corrections,
    };
  }
  function documentInput(input: DocumentInput): Wire.DocumentInput {
    return {
      consultationId: input.entryId,
      expectedRevision: input.expectedRevision,
      kind:
        input.kind === 'certificate' ? 'medical_certificate' : 'prescription',
      issueDate: input.issueDate,
      body: input.kind === 'certificate' ? input.findings : input.body,
      ...(input.kind === 'certificate'
        ? { purpose: input.purpose, remarks: input.remarks || null }
        : {}),
    };
  }
  function document(
    data: Wire.DocumentPreview | Wire.IssuedDocument,
  ): ClinicDocument {
    const snapshot = data.snapshot;
    const mapped: ClinicDocument = {
      id: 'id' in data ? data.id : null,
      status: 'id' in data ? 'issued' : 'preview',
      input: {
        entryId: data.consultationId,
        expectedRevision: snapshot.consultation.revision,
        kind:
          data.kind === 'medical_certificate' ? 'certificate' : 'prescription',
        issueDate: data.issueDate,
        body: data.kind === 'prescription' ? snapshot.body : '',
        findings: data.kind === 'medical_certificate' ? snapshot.body : '',
        remarks: snapshot.remarks ?? '',
        purpose: snapshot.purpose ?? '',
      },
      patient: {
        id: data.patientId,
        fullName: snapshot.patient.fullName,
        sex: snapshot.patient.sex ?? 'unknown',
        address: snapshot.patient.address ?? '',
        revision: 0,
        dateOfBirth: null,
        patientCategory: 'unknown',
        employeeIdentifier: '',
      },
      entry: {
        ...snapshot.consultation,
        patientId: data.patientId,
        authorId: data.issuerId,
        authorName: snapshot.issuer.displayName,
        discipline: 'medical',
        status: 'finalized',
        createdAt: 'createdAt' in data ? data.createdAt : data.issueDate,
        ageAtConsultation: snapshot.patient.age,
        cs: snapshot.patient.cs ?? '',
        vitalsId: null,
        reason: snapshot.consultation.reason ?? '',
        findings: snapshot.consultation.findings ?? '',
        clinicalImpression: snapshot.consultation.clinicalImpression ?? '',
        plan: snapshot.consultation.plan ?? '',
        corrections: [],
      },
      issuer: {
        id: data.issuerId,
        displayName: snapshot.issuer.displayName,
        role: 'doctor',
        isHead: false,
      },
      licenseText: snapshot.issuer.licenseText ?? '',
      ptrText: snapshot.issuer.ptrText ?? '',
      restriction: snapshot.restriction ?? '',
      followUp: snapshot.followUp ?? '',
    };
    return mapped;
  }
  const client: ClinicApi = {
    async login(input) {
      return result(wire.login(input), (data) => {
        return data;
      });
    },
    async logout() {
      const response = await wire.logout();
      if (response.ok && !response.data.serverRevoked)
        return {
          ok: false,
          error: {
            code: 'UNAVAILABLE',
            message:
              'Signed out here; the clinic server could not confirm revocation.',
          },
        };
      return result(Promise.resolve(response), () => null);
    },
    me: () =>
      result(wire.currentStaff(), (data) => {
        return data;
      }),
    health: () =>
      result(wire.health(), (data) => ({
        available: data.status === 'ok' && data.mode === 'EDGE',
      })),
    findPatients: (input) =>
      result(wire.searchPatients(input), (data) => data.map(patient)),
    getPatient: (input) => result(wire.readPatient(input), patient),
    createPatient: (input) =>
      result(wire.createPatient(fields(input)), patient),
    updatePatient: ({ id, expectedRevision, ...input }) =>
      result(
        wire.updatePatient({ id, expectedRevision, ...fields(input) }),
        patient,
      ),
    listVitals: (input) =>
      result(wire.readVitals(input), (data) => data.map(vitals)),
    saveVitals: ({ id, expectedRevision, patientId, ...input }) =>
      result(
        id
          ? wire.updateVitals({
              id,
              expectedRevision: expectedRevision ?? 0,
              ...input,
            })
          : wire.createVitals({ patientId, ...input }),
        vitals,
      ),
    finalizeVitals: (input) => result(wire.finalizeVitals(input), vitals),
    correctVitals: (input) =>
      result(wire.correctVitals(input), (data) =>
        vitals({ ...data.original, corrections: [data.correction] }),
      ),
    async listEntries(input) {
      const response = await result(wire.readEntries(input), (data) => data);
      if (!response.ok) return response;
      const rows = await Promise.all(
        response.data.map(async (data): Promise<Result<Entry>> =>
          result(wire.readCorrections({ id: data.id }), (history) =>
            entry(data, history.map(correction)),
          ),
        ),
      );
      const failed = rows.find((row) => !row.ok);
      if (failed && !failed.ok) return failed;
      return {
        ok: true,
        data: rows
          .flatMap((row) => (row.ok ? [row.data] : []))
          .sort((a, b) => b.consultationDate.localeCompare(a.consultationDate)),
      };
    },
    saveEntry: ({ id, expectedRevision, patientId, discipline, ...input }) =>
      discipline !== 'medical'
        ? Promise.resolve({
            ok: false,
            error: {
              code: 'DENIED',
              message: 'Entry editing is available for the medical chart only.',
            },
          })
        : result(
            id
              ? wire.updateMedicalEntry({
                  id,
                  expectedRevision: expectedRevision ?? 0,
                  ...input,
                })
              : wire.createMedicalEntry({ patientId, ...input }),
            (data) => entry(data),
          ),
    finalizeEntry: (input) =>
      result(wire.finalizeEntry(input), (data) => entry(data)),
    correctEntry: (input) =>
      result(wire.correctEntry(input), (data) =>
        entry(data.original, [correction(data.correction)]),
      ),
    listDocuments: (input) =>
      result(wire.readDocuments(input), (data) => data.map(document)),
    previewDocument: (input) =>
      result(wire.previewDocument(documentInput(input)), document),
    issueDocument: (input) =>
      result(wire.issueDocument(documentInput(input)), document),
    getDocument: (input) => result(wire.readDocument(input), document),
    listPrinters: () =>
      result(wire.listPrinters(), (data) =>
        data.map((printer) => ({
          id: printer.name,
          name: printer.displayName,
          isDefault: false,
        })),
      ),
    printDocument: ({ documentId, printerId }) =>
      result(
        wire.printDocument({
          documentId,
          printerName: printerId,
          copies: 1,
          duplexMode: 'simplex',
        }),
        (data) => ({ submitted: data.submitted }),
      ),
    onSessionReset: (listener) =>
      wire.onSessionReset((event) => {
        listener(event.reason);
      }),
  };
  return client;
}
