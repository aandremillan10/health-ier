import type {
  Correction,
  DocumentInput,
  DocumentPreview,
  DocumentSnapshot,
  IssuedDocument,
  Entry,
  MedicalFields,
  Patient,
  PatientFields,
  PatientIdentity,
  Requests,
  Staff,
  Vitals,
  VitalsFields,
} from '../shared/clinic-api';
import {
  array,
  boolean,
  choice,
  date,
  type Guard,
  nullable,
  nothing,
  number,
  object,
  optional,
  partial,
  record,
  revision,
  text,
  timestamp,
  uuid,
} from './validation';

export const staff = object<Staff>({
  id: uuid,
  displayName: text(200, 1),
  role: choice(['doctor', 'dentist', 'medtech', 'attendant', 'clerk']),
  isHead: boolean,
});
const patientFields = {
  fullName: text(200, 1),
  sex: nullable(text(50)),
  address: nullable(text(1000)),
  patientCategory: nullable(text(100)),
  employeeIdentifier: nullable(text(200)),
  dateOfBirth: nullable(date),
} satisfies { [K in keyof PatientFields]: Guard<PatientFields[K]> };
export const patientIdentity = object<PatientIdentity>({
  id: uuid,
  revision,
  fullName: patientFields.fullName,
  sex: patientFields.sex,
  dateOfBirth: patientFields.dateOfBirth,
});
export const patient = object<Patient>({
  ...patientFields,
  id: uuid,
  revision,
  createdAt: timestamp,
  updatedAt: timestamp,
});
const measurements = {
  systolic: nullable(number()),
  diastolic: nullable(number()),
  temperature: nullable(number(-273.15)),
  pulse: nullable(number()),
  respiratoryRate: nullable(number()),
  oxygenSaturation: nullable(number(0, 100)),
  weight: nullable(number()),
};
const vitalsFields = {
  ...measurements,
  recordedAt: optional(timestamp),
} satisfies { [K in keyof VitalsFields]-?: Guard<VitalsFields[K]> };
const authored = {
  id: uuid,
  patientId: uuid,
  authorId: uuid,
  status: choice(['draft', 'finalized']),
  revision,
  createdAt: timestamp,
  updatedAt: timestamp,
};
export const vitals = object<Vitals>({
  ...authored,
  ...measurements,
  recordedAt: timestamp,
});
const medicalFields = {
  consultationDate: date,
  ageAtConsultation: nullable(number(0, Number.MAX_SAFE_INTEGER, true)),
  cs: nullable(text(4000)),
  vitalsId: nullable(uuid),
  reason: nullable(text()),
  findings: nullable(text()),
  clinicalImpression: nullable(text()),
  plan: nullable(text()),
} satisfies { [K in keyof MedicalFields]: Guard<MedicalFields[K]> };
const discipline = choice(['medical', 'dental', 'laboratory']);
export const entry = object<Entry>({
  ...authored,
  ...medicalFields,
  consultationDate: nullable(date),
  discipline,
  text: nullable(text()),
});
function correction<T>(content: Guard<Partial<T>>): Guard<Correction<T>> {
  return object<Correction<T>>({
    id: uuid,
    originalEntryId: uuid,
    authorId: uuid,
    reason: text(4000, 1),
    correctedContent: content,
    createdAt: timestamp,
    sourceRevision: revision,
    revision,
    originalType: choice(['vitals', 'entry']),
  });
}
const vitalsCorrection = correction(partial(vitalsFields));
const medicalCorrection = correction(partial(medicalFields));
const entryReadCorrection = correction<MedicalFields | { text: string | null }>(
  (value): Partial<MedicalFields | { text: string | null }> => {
    const content = record(value);
    return Object.hasOwn(content, 'text')
      ? object<{ text: string | null }>({ text: nullable(text()) })(value)
      : partial(medicalFields)(value);
  },
);
const vitalsHistory = object<
  Vitals & { corrections: Correction<VitalsFields>[] }
>({
  ...authored,
  ...measurements,
  recordedAt: timestamp,
  corrections: array(vitalsCorrection),
});
const correctedVitals = object<{
  correction: Correction<VitalsFields>;
  original: Vitals;
}>({ correction: vitalsCorrection, original: vitals });
const correctedEntry = object<{
  correction: Correction<MedicalFields>;
  original: Entry;
}>({ correction: medicalCorrection, original: entry });
const documentFields = {
  consultationId: uuid,
  kind: choice(['prescription', 'medical_certificate']),
  expectedRevision: revision,
  issueDate: optional(date),
  body: text(20000, 1),
  purpose: optional(nullable(text(4000))),
  remarks: optional(nullable(text())),
  restriction: optional(nullable(text())),
  followUp: optional(nullable(text())),
} satisfies { [K in keyof DocumentInput]-?: Guard<DocumentInput[K]> };
export const documentSnapshot = object<DocumentSnapshot>({
  patient: object<DocumentSnapshot['patient']>({
    id: uuid,
    fullName: text(200, 1),
    age: nullable(number(0, Number.MAX_SAFE_INTEGER, true)),
    sex: nullable(text(50)),
    address: nullable(text(1000)),
    cs: nullable(text(4000)),
  }),
  issuer: object<DocumentSnapshot['issuer']>({
    id: uuid,
    displayName: text(200, 1),
    licenseText: nullable(text(200)),
    ptrText: nullable(text(200)),
  }),
  consultation: object<DocumentSnapshot['consultation']>({
    id: uuid,
    revision,
    consultationDate: date,
    reason: nullable(text()),
    findings: nullable(text()),
    clinicalImpression: nullable(text()),
    plan: nullable(text()),
  }),
  body: text(20000, 1),
  remarks: nullable(text()),
  purpose: nullable(text(4000)),
  restriction: nullable(text()),
  followUp: nullable(text()),
});
const previewFields = {
  kind: documentFields.kind,
  patientId: uuid,
  consultationId: uuid,
  issuerId: uuid,
  issueDate: date,
  snapshot: documentSnapshot,
};
export const documentPreview = object<DocumentPreview>(previewFields);
const parseIssuedDocument = object<IssuedDocument>({
  ...previewFields,
  id: uuid,
  revision,
  createdAt: timestamp,
});

export function issuedDocument(value: unknown): IssuedDocument {
  const document = parseIssuedDocument(value);
  if (
    document.patientId !== document.snapshot.patient.id ||
    document.consultationId !== document.snapshot.consultation.id ||
    document.issuerId !== document.snapshot.issuer.id
  )
    throw new Error('Snapshot identity mismatch');
  return document;
}
const id = { id: uuid };
const expected = { ...id, expectedRevision: revision };
function edit<T>(
  value: unknown,
  fields: Guard<Partial<T>>,
): { id: string; expectedRevision: number } & Partial<T> {
  // Parse identity separately, then strictly validate only the allowed mutable fields.
  const base = record(value);
  const { id: inputId, expectedRevision, ...content } = base;
  return {
    ...object<{ id: string; expectedRevision: number }>(expected)({
      id: inputId,
      expectedRevision,
    }),
    ...fields(content),
  };
}
export const requestGuards = {
  login: object<Requests['login']>({
    username: text(100, 1),
    password: text(1024, 1),
  }),
  currentStaff: nothing,
  logout: nothing,
  health: nothing,
  searchPatients: object<Requests['searchPatients']>({ search: text(200) }),
  createPatient: object<PatientFields>(patientFields),
  updatePatient: (value: unknown): Requests['updatePatient'] =>
    edit(value, partial(patientFields)),
  readVitals: object<Requests['readVitals']>({ patientId: uuid }),
  createVitals: object<Requests['createVitals']>({
    patientId: uuid,
    ...vitalsFields,
  }),
  updateVitals: (value: unknown): Requests['updateVitals'] =>
    edit(value, partial(vitalsFields)),
  finalizeVitals: object<Requests['finalizeVitals']>(expected),
  correctVitals: object<Requests['correctVitals']>({
    ...expected,
    reason: text(4000, 1),
    correctedContent: partial(vitalsFields),
  }),
  readEntries: object<Requests['readEntries']>({ patientId: uuid, discipline }),
  createMedicalEntry: object<Requests['createMedicalEntry']>({
    patientId: uuid,
    ...medicalFields,
  }),
  updateMedicalEntry: (value: unknown): Requests['updateMedicalEntry'] =>
    edit(value, partial(medicalFields)),
  finalizeEntry: object<Requests['finalizeEntry']>(expected),
  correctEntry: object<Requests['correctEntry']>({
    ...expected,
    reason: text(4000, 1),
    correctedContent: partial(medicalFields),
  }),
  readCorrections: object<Requests['readCorrections']>(id),
  previewDocument: object<DocumentInput>(documentFields),
  issueDocument: object<DocumentInput>(documentFields),
  readDocument: object<Requests['readDocument']>(id),
  listPrinters: nothing,
  printDocument: object<Requests['printDocument']>({
    documentId: uuid,
    printerName: text(256, 1),
    copies: number(1, 10, true),
    duplexMode: choice(['simplex', 'shortEdge', 'longEdge']),
  }),
} satisfies { [K in keyof Requests]: Guard<Requests[K]> };
export const operationNames = Object.keys(requestGuards) as (keyof Requests)[];
export const responseGuards = {
  currentStaff: staff,
  health: object<{ status: 'ok'; mode: 'EDGE' | 'CLOUD' }>({
    status: choice(['ok']),
    mode: choice(['EDGE', 'CLOUD']),
  }),
  searchPatients: array(patient),
  createPatient: patient,
  updatePatient: patient,
  readVitals: array(vitalsHistory),
  createVitals: vitals,
  updateVitals: vitals,
  finalizeVitals: vitals,
  correctVitals: correctedVitals,
  readEntries: array(entry),
  createMedicalEntry: entry,
  updateMedicalEntry: entry,
  finalizeEntry: entry,
  correctEntry: correctedEntry,
  readCorrections: array(entryReadCorrection),
  previewDocument: documentPreview,
  issueDocument: issuedDocument,
  readDocument: issuedDocument,
};
