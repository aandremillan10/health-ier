import {
  canEditRegistry,
  canReadVitals,
  canWriteEntry,
  visibleDisciplines,
} from './contract';
import { createClinicalSummaryDemo } from './clinical-summary-demo';
import { createDemoAppointments } from './appointments-demo';
import { createLaboratoryDemo } from './laboratory-demo';
import { createMembershipDemo } from './membership-demo';
import { createOperationsDemo } from './operations-demo';
import type { DemoAuditInput } from './operations-demo';
import type { Result as WireResult } from '../../shared/clinic-api';
import { createReferralsDemo } from './referrals-demo';
import type {
  ClinicApi,
  ClinicDocument,
  ClinicError,
  Correction,
  DocumentInput,
  Entry,
  Patient,
  Principal,
  Result,
  Revision,
  Vitals,
} from './contract';

export const demoStaff: Principal[] = [
  {
    id: 'demo-doctor-1',
    displayName: 'Dr. Mira Dalisay',
    role: 'doctor',
    isHead: true,
  },
  {
    id: 'demo-doctor-2',
    displayName: 'Dr. Leo Ventura',
    role: 'doctor',
    isHead: false,
  },
  {
    id: 'demo-dentist-1',
    displayName: 'Dr. Ada Soriano',
    role: 'dentist',
    isHead: false,
  },
  {
    id: 'demo-dentist-2',
    displayName: 'Dr. Noel Acosta',
    role: 'dentist',
    isHead: false,
  },
  {
    id: 'demo-medtech-1',
    displayName: 'Maya Rivera',
    role: 'medtech',
    isHead: false,
  },
  {
    id: 'demo-medtech-2',
    displayName: 'Ramon Cruz',
    role: 'medtech',
    isHead: false,
  },
  {
    id: 'demo-attendant',
    displayName: 'Celia Moreno',
    role: 'attendant',
    isHead: false,
  },
  {
    id: 'demo-clerk',
    displayName: 'Alina Mercado',
    role: 'clerk',
    isHead: false,
  },
];

function success<T>(data: T): Result<T> {
  return { ok: true, data: structuredClone(data) };
}
function failure<T>(
  code: ClinicError['code'],
  message: string,
  fieldErrors?: Record<string, string>,
  latestRevision?: number,
): Result<T> {
  return { ok: false, error: { code, message, fieldErrors, latestRevision } };
}

// Synthetic contract fixture only. No password bypass, persistence, network, or privileged IPC.
export function createDemoClinic(): {
  api: ClinicApi;
  selectStaff: (id: string) => Principal;
  setAvailable: (available: boolean) => void;
  conflictNext: () => void;
  failNextPrint: () => void;
} {
  let principal: Principal | null = null;
  let available = true;
  let conflict = false;
  let printFailure = false;
  const patients: Patient[] = [
    {
      id: 'DEMO-0001',
      revision: 1,
      fullName: 'Lina Marquez',
      sex: 'female',
      address: 'Demo address, Iloilo City',
      patientCategory: 'employee',
      employeeIdentifier: 'DEMO-EMP-001',
      dateOfBirth: '1989-04-12',
    },
    {
      id: 'DEMO-0002',
      revision: 1,
      fullName: 'Lina Marquez',
      sex: 'female',
      address: 'Demo address, Pavia',
      patientCategory: 'other',
      employeeIdentifier: '',
      dateOfBirth: '1971-09-08',
    },
    {
      id: 'DEMO-0003',
      revision: 1,
      fullName: 'Mateo Ramos',
      sex: 'male',
      address: 'Demo address, Leganes',
      patientCategory: 'unknown',
      employeeIdentifier: '',
      dateOfBirth: null,
    },
  ];
  const vitals: Vitals[] = [
    {
      id: 'demo-vitals-1',
      patientId: 'DEMO-0001',
      authorId: 'demo-attendant',
      authorName: 'Celia Moreno',
      recordedAt: '2026-10-14T01:00:00.000Z',
      systolic: 120,
      diastolic: 80,
      temperature: 36.8,
      pulse: 74,
      respiratoryRate: 18,
      oxygenSaturation: 98,
      weight: 62,
      status: 'finalized',
      revision: 2,
      corrections: [],
    },
  ];
  const entries: Entry[] = [
    {
      id: 'demo-medical-1',
      patientId: 'DEMO-0001',
      discipline: 'medical',
      authorId: 'demo-doctor-1',
      authorName: 'Dr. Mira Dalisay',
      consultationDate: '2026-10-14',
      ageAtConsultation: 37,
      cs: '',
      vitalsId: 'demo-vitals-1',
      reason: 'Synthetic follow-up consultation',
      findings: 'Synthetic examination notes for demonstration.',
      clinicalImpression: 'Synthetic clinical impression.',
      plan: 'Synthetic instructions entered by the clinician.',
      status: 'finalized',
      revision: 2,
      createdAt: '2026-10-14T01:15:00.000Z',
      corrections: [],
    },
    {
      id: 'demo-medical-2',
      patientId: 'DEMO-0001',
      discipline: 'medical',
      authorId: 'demo-doctor-2',
      authorName: 'Dr. Leo Ventura',
      consultationDate: '2026-10-12',
      ageAtConsultation: 37,
      cs: '',
      vitalsId: null,
      reason: 'Synthetic previous consultation',
      findings: 'Synthetic colleague notes.',
      clinicalImpression: '',
      plan: 'Synthetic previous plan.',
      status: 'finalized',
      revision: 2,
      createdAt: '2026-10-12T01:15:00.000Z',
      corrections: [],
    },
    {
      id: 'demo-dental-1',
      patientId: 'DEMO-0001',
      discipline: 'dental',
      authorId: 'demo-dentist-1',
      authorName: 'Dr. Ada Soriano',
      consultationDate: '2026-10-13',
      ageAtConsultation: null,
      cs: '',
      vitalsId: null,
      reason: 'Synthetic dental review',
      findings: 'Isolated dental proof record.',
      clinicalImpression: '',
      plan: '',
      status: 'finalized',
      revision: 2,
      createdAt: '2026-10-13T01:00:00.000Z',
      corrections: [],
    },
    {
      id: 'demo-lab-1',
      patientId: 'DEMO-0001',
      discipline: 'laboratory',
      authorId: 'demo-medtech-1',
      authorName: 'Maya Rivera',
      consultationDate: '2026-10-13',
      ageAtConsultation: null,
      cs: '',
      vitalsId: null,
      reason: 'Synthetic laboratory record',
      findings: 'Isolated laboratory proof record.',
      clinicalImpression: '',
      plan: '',
      status: 'finalized',
      revision: 2,
      createdAt: '2026-10-13T02:00:00.000Z',
      corrections: [],
    },
  ];
  const documents: ClinicDocument[] = [];
  function guard<T>(): Result<T> | null {
    if (!available)
      return failure(
        'UNAVAILABLE',
        'Clinic server unavailable. Keep your input and try again when the connection returns.',
      );
    if (!principal)
      return failure('UNAUTHENTICATED', 'Sign in again to continue.');
    return null;
  }
  function revisionError<T>(
    record: { revision: number },
    expected: number | undefined,
  ): Result<T> | null {
    if (conflict) {
      conflict = false;
      record.revision += 1;
    }
    return record.revision === expected
      ? null
      : failure(
          'CONFLICT',
          'This record changed. Review the latest version before you retry.',
          undefined,
          record.revision,
        );
  }
  function canRead(entry: Entry): boolean {
    return (
      principal !== null &&
      visibleDisciplines(principal).includes(entry.discipline)
    );
  }
  function addCorrection(
    record: Entry | Vitals,
    input: Revision & {
      reason: string;
      correctedContent: Record<string, string | number | null>;
    },
  ): Correction {
    return {
      id: crypto.randomUUID(),
      originalEntryId: record.id,
      authorId: record.authorId,
      authorName: record.authorName,
      reason: input.reason,
      correctedContent: structuredClone(input.correctedContent),
      createdAt: new Date().toISOString(),
      sourceRevision: record.revision,
    };
  }
  function documentPreview(input: DocumentInput): Result<ClinicDocument> {
    const denied = guard<ClinicDocument>();
    if (denied) return denied;
    const entry = entries.find((e) => e.id === input.entryId);
    if (!entry || !canRead(entry))
      return failure(
        'NOT_FOUND',
        'Consultation unavailable. Return to the chart and select an available entry.',
      );
    if (
      principal?.role !== 'doctor' ||
      principal.id !== entry.authorId ||
      entry.discipline !== 'medical' ||
      entry.status !== 'finalized'
    )
      return failure(
        'DENIED',
        'Only the original doctor can prepare a document from a finalized medical consultation.',
      );
    const stale = revisionError<ClinicDocument>(entry, input.expectedRevision);
    if (stale) return stale;
    const patient = patients.find((p) => p.id === entry.patientId);
    if (!patient)
      return failure(
        'NOT_FOUND',
        'Patient unavailable. Return to patient records.',
      );
    if (
      !input.issueDate ||
      (input.kind === 'prescription' && !input.body.trim()) ||
      (input.kind === 'certificate' && !input.purpose.trim())
    )
      return failure(
        'VALIDATION',
        'Complete the document before you preview it.',
        {
          [input.kind === 'prescription' ? 'body' : 'purpose']:
            'Enter the required document text.',
        },
      );
    return success({
      id: null,
      input,
      patient,
      entry,
      issuer: principal,
      licenseText: '',
      ptrText: '',
      status: 'preview',
    });
  }
  const appointments = createDemoAppointments({
    getStaff: () => principal,
    getPatient: (id) => patients.find((patient) => patient.id === id) ?? null,
    isAvailable: () => available,
  });
  const { snapshotAppointments: appointmentSnapshot, ...appointmentApi } =
    appointments;
  const laboratory = createLaboratoryDemo({
    getStaff: () => principal,
    getPatient: (id) => patients.find((patient) => patient.id === id),
    check: () => guard<never>(),
  });
  const membership = createMembershipDemo(
    () => principal,
    (id) => patients.find((patient) => patient.id === id) ?? null,
  );
  const registrations = new Map(
    patients.map((patient) => [patient.id, new Date().toISOString()]),
  );
  const operations = createOperationsDemo({
    getStaff: () => principal,
    isAvailable: () => available,
    getStaffList: () => demoStaff,
    getPatientRegistrations: () =>
      [...registrations].map(([id, createdAt]) => ({ id, createdAt })),
    getAppointments: appointmentSnapshot,
    getLabOrders: laboratory.snapshot,
    getMemberships: membership.snapshot,
  });
  const referrals = createReferralsDemo({
    getStaff: () => principal,
    getPatient: (id) => patients.find((patient) => patient.id === id),
    getLabOrders: laboratory.snapshot,
    check: () => guard<never>(),
  });
  const api: ClinicApi = {
    ...referrals.api,
    ...membership.api,
    ...operations.api,
    ...laboratory.api,
    ...appointmentApi,
    ...createClinicalSummaryDemo(
      () => principal,
      (id) => patients.some((patient) => patient.id === id),
    ),
    async login() {
      return failure(
        'UNAVAILABLE',
        'Demo fixtures do not authenticate passwords. Use Open frontend demo.',
      );
    },
    async logout() {
      principal = null;
      return success(null);
    },
    async me() {
      return principal
        ? success(principal)
        : failure('UNAUTHENTICATED', 'Sign in to continue.');
    },
    async health() {
      return success({ available });
    },
    async findPatients({ search }) {
      const denied = guard<Patient[]>();
      if (denied) return denied;
      const query = search.trim().toLocaleLowerCase('en-PH');
      const found = patients.filter((p) =>
        `${p.fullName} ${p.id} ${p.employeeIdentifier}`
          .toLocaleLowerCase('en-PH')
          .includes(query),
      );
      return success(
        principal?.role === 'medtech'
          ? found.map((p) => ({
              ...p,
              address: '',
              employeeIdentifier: '',
              patientCategory: 'unknown',
            }))
          : found,
      );
    },
    async getPatient({ id }) {
      const denied = guard<Patient>();
      if (denied) return denied;
      const record = patients.find((p) => p.id === id);
      if (!record)
        return failure(
          'NOT_FOUND',
          'Patient unavailable. Search for another patient.',
        );
      return success(
        principal?.role === 'medtech'
          ? {
              ...record,
              address: '',
              employeeIdentifier: '',
              patientCategory: 'unknown',
            }
          : record,
      );
    },
    async createPatient(input) {
      const denied = guard<Patient>();
      if (denied) return denied;
      if (!principal || !canEditRegistry(principal))
        return failure(
          'DENIED',
          'Only the clerk or nursing attendant can register patients.',
        );
      if (!input.fullName.trim())
        return failure('VALIDATION', 'Enter the patient name.', {
          fullName: 'Enter the patient name.',
        });
      const record = {
        ...input,
        fullName: input.fullName.trim(),
        id: `DEMO-${String(patients.length + 1).padStart(4, '0')}`,
        revision: 1,
      };
      patients.push(record);
      return success(record);
    },
    async updatePatient(input) {
      const denied = guard<Patient>();
      if (denied) return denied;
      if (!principal || !canEditRegistry(principal))
        return failure(
          'DENIED',
          'Only the clerk or nursing attendant can update patient details.',
        );
      const record = patients.find((p) => p.id === input.id);
      if (!record)
        return failure(
          'NOT_FOUND',
          'Patient unavailable. Return to patient records.',
        );
      const stale = revisionError<Patient>(record, input.expectedRevision);
      if (stale) return stale;
      if (!input.fullName.trim())
        return failure('VALIDATION', 'Enter the patient name.', {
          fullName: 'Enter the patient name.',
        });
      const { expectedRevision: _revision, ...fields } = input;
      void _revision;
      Object.assign(record, fields, { revision: record.revision + 1 });
      return success(record);
    },
    async listVitals({ patientId }) {
      const denied = guard<Vitals[]>();
      if (denied) return denied;
      if (!principal || !canReadVitals(principal))
        return failure('DENIED', 'Your account cannot read vital signs.');
      return success(vitals.filter((v) => v.patientId === patientId));
    },
    async saveVitals(input) {
      const denied = guard<Vitals>();
      if (denied) return denied;
      if (principal?.role !== 'attendant')
        return failure(
          'DENIED',
          'Only the nursing attendant can record vital signs.',
        );
      if (!patients.some((p) => p.id === input.patientId))
        return failure(
          'NOT_FOUND',
          'Patient unavailable. Return to patient records.',
        );
      const fields = [
        'systolic',
        'diastolic',
        'temperature',
        'pulse',
        'respiratoryRate',
        'oxygenSaturation',
        'weight',
      ] as const;
      for (const field of fields) {
        const value = input[field];
        if (
          value !== null &&
          (!Number.isFinite(value) ||
            value < 0 ||
            (field === 'oxygenSaturation' && value > 100))
        )
          return failure('VALIDATION', 'Check the measurement values.', {
            [field]:
              'Enter a valid nonnegative measurement in the stated unit.',
          });
      }
      const record = vitals.find((v) => v.id === input.id);
      if (input.id && !record)
        return failure(
          'NOT_FOUND',
          'Measurements unavailable. Return to the patient record.',
        );
      if (record) {
        if (record.authorId !== principal.id || record.status !== 'draft')
          return failure(
            'DENIED',
            'Only your own draft measurements can be edited.',
          );
        const stale = revisionError<Vitals>(record, input.expectedRevision);
        if (stale) return stale;
        Object.assign(record, input, { revision: record.revision + 1 });
        return success(record);
      }
      const newRecord: Vitals = {
        ...input,
        id: crypto.randomUUID(),
        authorId: principal.id,
        authorName: principal.displayName,
        status: 'draft',
        revision: 1,
        corrections: [],
      };
      vitals.unshift(newRecord);
      return success(newRecord);
    },
    async finalizeVitals(input) {
      const denied = guard<Vitals>();
      if (denied) return denied;
      const record = vitals.find((v) => v.id === input.id);
      if (!record)
        return failure(
          'NOT_FOUND',
          'Measurements unavailable. Return to the patient record.',
        );
      if (
        principal?.role !== 'attendant' ||
        record.authorId !== principal.id ||
        record.status !== 'draft'
      )
        return failure(
          'DENIED',
          'Only your own draft measurements can be finalized.',
        );
      const stale = revisionError<Vitals>(record, input.expectedRevision);
      if (stale) return stale;
      record.status = 'finalized';
      record.revision++;
      return success(record);
    },
    async correctVitals(input) {
      const denied = guard<Vitals>();
      if (denied) return denied;
      const record = vitals.find((v) => v.id === input.id);
      if (
        !record ||
        principal?.role !== 'attendant' ||
        record.authorId !== principal.id ||
        record.status !== 'finalized'
      )
        return failure(
          'DENIED',
          'Only your own finalized measurements can be corrected.',
        );
      const stale = revisionError<Vitals>(record, input.expectedRevision);
      if (stale) return stale;
      if (!input.reason.trim())
        return failure('VALIDATION', 'Enter a correction reason.', {
          reason: 'Enter a correction reason.',
        });
      for (const field of [
        'systolic',
        'diastolic',
        'temperature',
        'pulse',
        'respiratoryRate',
        'oxygenSaturation',
        'weight',
      ] as const) {
        const value = input.correctedContent[field];
        if (
          value !== null &&
          (!Number.isFinite(value) ||
            value < 0 ||
            (field === 'oxygenSaturation' && value > 100))
        )
          return failure('VALIDATION', 'Check the corrected measurement.', {
            [field]: 'Enter a valid measurement in the stated unit.',
          });
      }
      record.corrections.push(addCorrection(record, input));
      record.revision++;
      return success(record);
    },
    async listEntries({ patientId, discipline }) {
      const denied = guard<Entry[]>();
      if (denied) return denied;
      if (!principal || !visibleDisciplines(principal).includes(discipline))
        return failure('DENIED', 'Your account cannot read this chart.');
      return success(
        entries
          .filter(
            (e) => e.patientId === patientId && e.discipline === discipline,
          )
          .sort((a, b) => b.consultationDate.localeCompare(a.consultationDate)),
      );
    },
    async saveEntry(input) {
      const denied = guard<Entry>();
      if (denied) return denied;
      if (!principal || !canWriteEntry(principal, input.discipline))
        return failure('DENIED', 'Your account cannot write in this chart.');
      if (!patients.some((p) => p.id === input.patientId))
        return failure(
          'NOT_FOUND',
          'Patient unavailable. Return to patient records.',
        );
      if (!input.reason.trim())
        return failure('VALIDATION', 'Enter the reason for consultation.', {
          reason: 'Enter the reason for consultation.',
        });
      if (
        input.vitalsId &&
        !vitals.some(
          (v) =>
            v.id === input.vitalsId &&
            v.patientId === input.patientId &&
            v.status === 'finalized',
        )
      )
        return failure(
          'VALIDATION',
          'Select finalized vital signs for this patient or None.',
          { vitalsId: 'Select available vital signs or None.' },
        );
      const record = entries.find((e) => e.id === input.id);
      if (input.id && !record)
        return failure('NOT_FOUND', 'Entry unavailable. Return to the chart.');
      if (record) {
        if (record.authorId !== principal.id || record.status !== 'draft')
          return failure(
            'DENIED',
            'Only your own draft entries can be edited.',
          );
        const stale = revisionError<Entry>(record, input.expectedRevision);
        if (stale) return stale;
        Object.assign(record, input, { revision: record.revision + 1 });
        return success(record);
      }
      const newRecord: Entry = {
        ...input,
        id: crypto.randomUUID(),
        authorId: principal.id,
        authorName: principal.displayName,
        status: 'draft',
        revision: 1,
        createdAt: new Date().toISOString(),
        corrections: [],
      };
      entries.unshift(newRecord);
      return success(newRecord);
    },
    async finalizeEntry(input) {
      const denied = guard<Entry>();
      if (denied) return denied;
      const record = entries.find((e) => e.id === input.id);
      if (
        !record ||
        !principal ||
        !canWriteEntry(principal, record.discipline) ||
        record.authorId !== principal.id ||
        record.status !== 'draft'
      )
        return failure('DENIED', 'Only your own draft entry can be finalized.');
      const stale = revisionError<Entry>(record, input.expectedRevision);
      if (stale) return stale;
      record.status = 'finalized';
      record.revision++;
      return success(record);
    },
    async correctEntry(input) {
      const denied = guard<Entry>();
      if (denied) return denied;
      const record = entries.find((e) => e.id === input.id);
      if (
        !record ||
        !principal ||
        !canWriteEntry(principal, record.discipline) ||
        record.authorId !== principal.id ||
        record.status !== 'finalized'
      )
        return failure(
          'DENIED',
          'Only your own finalized entry can be corrected.',
        );
      const stale = revisionError<Entry>(record, input.expectedRevision);
      if (stale) return stale;
      if (!input.reason.trim())
        return failure('VALIDATION', 'Enter a correction reason.', {
          reason: 'Enter a correction reason.',
        });
      if (
        input.correctedContent.vitalsId &&
        !vitals.some(
          (v) =>
            v.id === input.correctedContent.vitalsId &&
            v.patientId === record.patientId &&
            v.status === 'finalized',
        )
      )
        return failure(
          'VALIDATION',
          'Select available finalized vital signs or None.',
        );
      record.corrections.push(addCorrection(record, input));
      record.revision++;
      return success(record);
    },
    async listDocuments({ patientId }) {
      const denied = guard<ClinicDocument[]>();
      if (denied) return denied;
      if (!principal || !visibleDisciplines(principal).includes('medical'))
        return failure('DENIED', 'Your account cannot read medical documents.');
      return success(documents.filter((d) => d.patient.id === patientId));
    },
    async previewDocument(input) {
      return documentPreview(input);
    },
    async issueDocument(input) {
      const result = documentPreview(input);
      if (!result.ok) return result;
      const document: ClinicDocument = {
        ...result.data,
        id: crypto.randomUUID(),
        status: 'issued',
      };
      documents.push(structuredClone(document));
      return success(document);
    },
    async getDocument({ id }) {
      const denied = guard<ClinicDocument>();
      if (denied) return denied;
      const record = documents.find((d) => d.id === id);
      if (!record || !canRead(record.entry))
        return failure(
          'NOT_FOUND',
          'Document unavailable. Return to the chart.',
        );
      return success(record);
    },
    async listPrinters() {
      const denied = guard<import('./contract').Printer[]>();
      if (denied) return denied;
      return success([
        {
          id: 'demo-printer',
          name: 'Demo printer (simulation)',
          isDefault: true,
        },
      ]);
    },
    async printDocument({ documentId, printerId }) {
      const denied = guard<{ submitted: boolean }>();
      if (denied) return denied;
      const document = documents.find((d) => d.id === documentId);
      if (!document || !canRead(document.entry))
        return failure(
          'NOT_FOUND',
          'Document unavailable. Return to the chart.',
        );
      if (printerId !== 'demo-printer')
        return failure('VALIDATION', 'Select an available printer.');
      if (printFailure) {
        printFailure = false;
        return failure(
          'UNAVAILABLE',
          'Printer unavailable. Check the printer and retry this issued document.',
        );
      }
      return success({ submitted: true });
    },
  };
  const auditActions = {
    listReferrals: ['view', 'referral'],
    listReferralInbox: ['view', 'referral'],
    listSentReferrals: ['view', 'referral'],
    createReferral: ['create', 'referral'],
    acceptReferral: ['change', 'referral'],
    startReferral: ['change', 'referral'],
    completeReferral: ['change', 'referral'],
    cancelReferral: ['change', 'referral'],
    rejectReferral: ['change', 'referral'],
    getPatient: ['view', 'patient'],
    listVitals: ['view', 'vitals'],
    listEntries: ['view', 'entry'],
    listDocuments: ['view', 'document'],
    getDocument: ['view', 'document'],
    createPatient: ['create', 'patient'],
    updatePatient: ['change', 'patient'],
    saveVitals: ['change', 'vitals'],
    finalizeVitals: ['finalize', 'vitals'],
    correctVitals: ['correction', 'vitals'],
    saveEntry: ['change', 'entry'],
    finalizeEntry: ['finalize', 'entry'],
    correctEntry: ['correction', 'entry'],
    issueDocument: ['create', 'document'],
    printDocument: ['print', 'document'],
    readClinicalSummary: ['view', 'clinical-summary'],
    readSummaryHistory: ['view', 'clinical-summary'],
    createSummaryItem: ['create', 'clinical-summary'],
    updateSummaryItem: ['change', 'clinical-summary'],
    correctSummaryItem: ['correction', 'clinical-summary'],
    inactivateSummaryItem: ['change', 'clinical-summary'],
    listAppointments: ['view', 'appointment'],
    createAppointment: ['create', 'appointment'],
    transitionAppointment: ['change', 'appointment'],
    correctAppointment: ['correction', 'appointment'],
    listLabOrders: ['view', 'lab-order'],
    listLabQueue: ['view', 'lab-order'],
    createLabOrder: ['create', 'lab-order'],
    startLabOrder: ['change', 'lab-order'],
    cancelLabOrder: ['change', 'lab-order'],
    rejectLabOrder: ['change', 'lab-order'],
    saveLabResult: ['change', 'lab-result'],
    finalizeLabResult: ['finalize', 'lab-result'],
    correctLabResult: ['correction', 'lab-result'],
    reviewLabOrder: ['change', 'lab-order'],
    readPatientFamily: ['view', 'membership'],
    readMembershipHistory: ['view', 'membership'],
    readDependentHistory: ['view', 'dependent-link'],
    createMembership: ['create', 'membership'],
    updateMembership: ['change', 'membership'],
    correctMembership: ['correction', 'membership'],
    linkDependent: ['create', 'dependent-link'],
    updateDependent: ['change', 'dependent-link'],
    correctDependent: ['correction', 'dependent-link'],
    unlinkDependent: ['change', 'dependent-link'],
  } satisfies Partial<
    Record<keyof ClinicApi, [DemoAuditInput['action'], string]>
  >;
  for (const name of Object.keys(
    auditActions,
  ) as (keyof typeof auditActions)[]) {
    const original = api[name] as (
      input: unknown,
    ) => Promise<Result<unknown> | WireResult<unknown>>;
    Object.assign(api, {
      [name]: async (input: unknown) => {
        const denied = guard<never>();
        if (denied) return denied;
        const result = await original(input);
        const fields =
          input && typeof input === 'object'
            ? (input as Record<string, unknown>)
            : {};
        const row =
          result.ok &&
          result.data &&
          typeof result.data === 'object' &&
          !Array.isArray(result.data)
            ? (result.data as Record<string, unknown>)
            : {};
        const id = (value: unknown): string | undefined =>
          typeof value === 'string' ? value : undefined;
        const [action, resourceType] = auditActions[name];
        operations.record({
          action,
          resourceType,
          resourceId: id(row.id) ?? id(fields.id) ?? id(fields.documentId),
          patientId:
            id(row.patientId) ??
            id(fields.patientId) ??
            (resourceType === 'patient'
              ? (id(row.id) ?? id(fields.id))
              : undefined),
          outcome: result.ok ? 'success' : 'failure',
        });
        if (name === 'createPatient' && result.ok && id(row.id))
          registrations.set(id(row.id)!, new Date().toISOString());
        return result;
      },
    });
  }
  return {
    api,
    selectStaff(id): Principal {
      const staff = demoStaff.find((s) => s.id === id);
      if (!staff) throw new Error('Unknown demo staff.');
      principal = staff;
      return structuredClone(staff);
    },
    setAvailable(value): void {
      available = value;
    },
    conflictNext(): void {
      conflict = true;
    },
    failNextPrint(): void {
      printFailure = true;
    },
  };
}
