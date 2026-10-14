// Renderer view model, shared by the explicit demo and the typed desktop bridge adapter.
export type Role = 'doctor' | 'dentist' | 'medtech' | 'attendant' | 'clerk';
export type Discipline = 'medical' | 'dental' | 'laboratory';
export type Principal = {
  id: string;
  displayName: string;
  role: Role;
  isHead: boolean;
};
export type Result<T> =
  { ok: true; data: T } | { ok: false; error: ClinicError };
export type ClinicError = {
  code:
    | 'VALIDATION'
    | 'UNAUTHENTICATED'
    | 'DENIED'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'UNAVAILABLE';
  message: string;
  fieldErrors?: Record<string, string>;
  latestRevision?: number;
};
export type PatientInput = {
  fullName: string;
  sex: string;
  address: string;
  patientCategory: string;
  employeeIdentifier: string;
  dateOfBirth: string | null;
};
export type Patient = PatientInput & { id: string; revision: number };
export type Lifecycle = 'draft' | 'finalized';
export type Correction = {
  id: string;
  originalEntryId: string;
  authorId: string;
  authorName: string;
  reason: string;
  correctedContent: Record<string, string | number | null>;
  createdAt: string;
  sourceRevision: number;
};
export type VitalsInput = {
  recordedAt: string;
  systolic: number | null;
  diastolic: number | null;
  temperature: number | null;
  pulse: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  weight: number | null;
};
export type Vitals = VitalsInput & {
  id: string;
  patientId: string;
  authorId: string;
  authorName: string;
  status: Lifecycle;
  revision: number;
  corrections: Correction[];
};
export type EntryInput = {
  consultationDate: string;
  // Derived from DOB and consultation date; retained in the clinical/document snapshot.
  ageAtConsultation: number | null;
  cs: string;
  vitalsId: string | null;
  reason: string;
  findings: string;
  clinicalImpression: string;
  plan: string;
};
export type Entry = EntryInput & {
  id: string;
  patientId: string;
  discipline: Discipline;
  authorId: string;
  authorName: string;
  status: Lifecycle;
  revision: number;
  createdAt: string;
  corrections: Correction[];
};
export type DocumentInput = {
  entryId: string;
  expectedRevision: number;
  kind: 'prescription' | 'certificate';
  issueDate: string;
  body: string;
  findings: string;
  remarks: string;
  purpose: string;
};
export type ClinicDocument = {
  id: string | null;
  input: DocumentInput;
  patient: Patient;
  entry: Entry;
  issuer: Principal;
  licenseText: string;
  ptrText: string;
  status: 'preview' | 'issued';
  restriction?: string;
  followUp?: string;
};
export type Printer = { id: string; name: string; isDefault: boolean };
export type Revision = { id: string; expectedRevision: number };
export interface ClinicApi {
  onSessionReset?: (listener: (reason: string) => void) => () => void;
  login(input: {
    username: string;
    password: string;
  }): Promise<Result<Principal>>;
  logout(): Promise<Result<null>>;
  me(): Promise<Result<Principal>>;
  health(): Promise<Result<{ available: boolean }>>;
  findPatients(input: { search: string }): Promise<Result<Patient[]>>;
  getPatient(input: { id: string }): Promise<Result<Patient>>;
  createPatient(input: PatientInput): Promise<Result<Patient>>;
  updatePatient(input: PatientInput & Revision): Promise<Result<Patient>>;
  listVitals(input: { patientId: string }): Promise<Result<Vitals[]>>;
  saveVitals(
    input: VitalsInput & {
      patientId: string;
      id?: string;
      expectedRevision?: number;
    },
  ): Promise<Result<Vitals>>;
  finalizeVitals(input: Revision): Promise<Result<Vitals>>;
  correctVitals(
    input: Revision & { reason: string; correctedContent: VitalsInput },
  ): Promise<Result<Vitals>>;
  listEntries(input: {
    patientId: string;
    discipline: Discipline;
  }): Promise<Result<Entry[]>>;
  saveEntry(
    input: EntryInput & {
      patientId: string;
      discipline: Discipline;
      id?: string;
      expectedRevision?: number;
    },
  ): Promise<Result<Entry>>;
  finalizeEntry(input: Revision): Promise<Result<Entry>>;
  correctEntry(
    input: Revision & { reason: string; correctedContent: EntryInput },
  ): Promise<Result<Entry>>;
  listDocuments(input: {
    patientId: string;
  }): Promise<Result<ClinicDocument[]>>;
  previewDocument(input: DocumentInput): Promise<Result<ClinicDocument>>;
  issueDocument(input: DocumentInput): Promise<Result<ClinicDocument>>;
  getDocument(input: { id: string }): Promise<Result<ClinicDocument>>;
  listPrinters(): Promise<Result<Printer[]>>;
  printDocument(input: {
    documentId: string;
    printerId: string;
  }): Promise<Result<{ submitted: boolean }>>;
}

declare global {
  interface Window {
    clinicApi?: ClinicApi;
  }
}

export const roleNames: Record<Role, string> = {
  doctor: 'Medical doctor',
  dentist: 'Dentist',
  medtech: 'Medical technologist',
  attendant: 'Nursing attendant',
  clerk: 'Clerk',
};
export function visibleDisciplines(staff: Principal): Discipline[] {
  if (staff.isHead) return ['medical', 'dental', 'laboratory'];
  if (staff.role === 'doctor') return ['medical'];
  if (staff.role === 'dentist') return ['dental'];
  if (staff.role === 'medtech') return ['laboratory'];
  return [];
}
export function canEditRegistry(staff: Principal): boolean {
  return staff.role === 'clerk' || staff.role === 'attendant';
}
export function canReadVitals(staff: Principal): boolean {
  return (
    staff.isHead || ['doctor', 'dentist', 'attendant'].includes(staff.role)
  );
}
export function canWriteEntry(
  staff: Principal,
  discipline: Discipline,
): boolean {
  return (
    (staff.role === 'doctor' && discipline === 'medical') ||
    (staff.role === 'dentist' && discipline === 'dental') ||
    (staff.role === 'medtech' && discipline === 'laboratory')
  );
}

export type ChartTab = 'details' | 'vitals' | Discipline;
export const chartNames: Record<Discipline, string> = {
  medical: 'Medical chart',
  dental: 'Dental chart',
  laboratory: 'Laboratory chart',
};

export const measures = {
  systolic: 'Systolic · mmHg',
  diastolic: 'Diastolic · mmHg',
  temperature: 'Temperature · °C',
  pulse: 'Pulse · /min',
  respiratoryRate: 'Respiratory rate · /min',
  oxygenSaturation: 'Oxygen saturation · %',
  weight: 'Weight · kg',
};

// Start a new correction from the last accepted content; originals stay unchanged.
export function currentContent<T extends Entry | Vitals>(original: T): T {
  return original.corrections.reduce(
    (content, correction) => ({
      ...content,
      ...correction.correctedContent,
    }),
    { ...original },
  );
}
