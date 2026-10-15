import type { OperationsRequests, OperationsResponses } from './operations-api';
import type { SummaryRequests, SummaryResponses } from './clinical-summary';
import type {
  AppointmentRequests,
  AppointmentResponses,
} from './appointments-api';
import type { LaboratoryRequests, LaboratoryResponses } from './laboratory-api';
import type { MembershipRequests, MembershipResponses } from './membership';
import type { ReferralsRequests, ReferralsResponses } from './referrals-api';

export type StaffRole =
  'doctor' | 'dentist' | 'medtech' | 'attendant' | 'clerk';
export interface Staff {
  id: string;
  displayName: string;
  role: StaffRole;
  isHead: boolean;
}
export interface PatientIdentity {
  id: string;
  revision: number;
  fullName: string;
  sex: string | null;
  dateOfBirth: string | null;
}
export interface PatientFields {
  fullName: string;
  sex: string | null;
  address: string | null;
  patientCategory: string | null;
  employeeIdentifier: string | null;
  dateOfBirth: string | null;
}
export interface Patient extends PatientIdentity, PatientFields {
  createdAt: string;
  updatedAt: string;
}
export interface Measurements {
  systolic: number | null;
  diastolic: number | null;
  temperature: number | null;
  pulse: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  weight: number | null;
}
export interface VitalsFields extends Measurements {
  recordedAt?: string;
}
export interface AuthoredRecord {
  id: string;
  patientId: string;
  authorId: string;
  authorName: string;
  status: 'draft' | 'finalized';
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface Vitals extends AuthoredRecord, Measurements {
  recordedAt: string;
}
export type Discipline = 'medical' | 'dental' | 'laboratory';
export interface MedicalFields {
  consultationDate: string;
  ageAtConsultation: number | null;
  cs: string | null;
  vitalsId: string | null;
  reason: string | null;
  findings: string | null;
  clinicalImpression: string | null;
  plan: string | null;
}
export interface Entry
  extends AuthoredRecord, Omit<MedicalFields, 'consultationDate'> {
  discipline: Discipline;
  consultationDate: string | null;
  text: string | null;
}
export interface Correction<T> {
  id: string;
  originalEntryId: string;
  authorId: string;
  authorName: string;
  reason: string;
  correctedContent: Partial<T>;
  createdAt: string;
  sourceRevision: number;
  originalType: 'vitals' | 'entry';
  revision: number;
}
export interface DocumentInput {
  consultationId: string;
  kind: 'prescription' | 'medical_certificate';
  expectedRevision: number;
  issueDate?: string;
  body: string;
  purpose?: string | null;
  remarks?: string | null;
  restriction?: string | null;
  followUp?: string | null;
}
export interface DocumentSnapshot {
  patient: {
    id: string;
    fullName: string;
    age: number | null;
    sex: string | null;
    address: string | null;
    cs: string | null;
  };
  issuer: {
    id: string;
    displayName: string;
    licenseText: string | null;
    ptrText: string | null;
  };
  consultation: {
    id: string;
    revision: number;
    consultationDate: string;
    reason: string | null;
    findings: string | null;
    clinicalImpression: string | null;
    plan: string | null;
  };
  body: string;
  purpose: string | null;
  remarks: string | null;
  restriction: string | null;
  followUp: string | null;
}
export interface DocumentPreview {
  kind: DocumentInput['kind'];
  patientId: string;
  consultationId: string;
  issuerId: string;
  issueDate: string;
  snapshot: DocumentSnapshot;
}
export interface IssuedDocument extends DocumentPreview {
  id: string;
  revision: number;
  createdAt: string;
}
export interface Printer {
  name: string;
  displayName: string;
}
export interface PrintInput {
  documentId: string;
  printerName: string;
  copies: number;
  duplexMode: 'simplex' | 'shortEdge' | 'longEdge';
}
type IdInput = { id: string };
type RevisionInput = IdInput & { expectedRevision: number };
export interface Requests
  extends
    OperationsRequests,
    SummaryRequests,
    AppointmentRequests,
    LaboratoryRequests,
    MembershipRequests,
    ReferralsRequests {
  login: { username: string; password: string };
  currentStaff: undefined;
  logout: undefined;
  health: undefined;
  searchPatients: { search: string };
  readPatient: IdInput;
  readDocuments: { patientId: string };
  createPatient: PatientFields;
  updatePatient: IdInput &
    Partial<PatientFields> & { expectedRevision: number };
  readVitals: { patientId: string };
  createVitals: { patientId: string } & VitalsFields;
  updateVitals: IdInput & Partial<VitalsFields> & { expectedRevision: number };
  finalizeVitals: RevisionInput;
  correctVitals: RevisionInput & {
    reason: string;
    correctedContent: Partial<VitalsFields>;
  };
  readEntries: { patientId: string; discipline: Discipline };
  createMedicalEntry: { patientId: string } & MedicalFields;
  updateMedicalEntry: IdInput &
    Partial<MedicalFields> & { expectedRevision: number };
  finalizeEntry: RevisionInput;
  correctEntry: RevisionInput & {
    reason: string;
    correctedContent: Partial<MedicalFields>;
  };
  readCorrections: IdInput;
  previewDocument: DocumentInput;
  issueDocument: DocumentInput;
  readDocument: IdInput;
  listPrinters: undefined;
  printDocument: PrintInput;
}
export interface Responses
  extends
    OperationsResponses,
    SummaryResponses,
    AppointmentResponses,
    LaboratoryResponses,
    MembershipResponses,
    ReferralsResponses {
  login: { staff: Staff; generation: number };
  currentStaff: Staff;
  logout: { loggedOut: true; serverRevoked: boolean };
  health: { status: 'ok'; mode: 'EDGE' | 'CLOUD' };
  searchPatients: (Patient | PatientIdentity)[];
  readPatient: Patient | PatientIdentity;
  readDocuments: IssuedDocument[];
  createPatient: Patient;
  updatePatient: Patient;
  readVitals: (Vitals & { corrections: Correction<VitalsFields>[] })[];
  createVitals: Vitals;
  updateVitals: Vitals;
  finalizeVitals: Vitals;
  correctVitals: { correction: Correction<VitalsFields>; original: Vitals };
  readEntries: Entry[];
  createMedicalEntry: Entry;
  updateMedicalEntry: Entry;
  finalizeEntry: Entry;
  correctEntry: { correction: Correction<MedicalFields>; original: Entry };
  readCorrections: Correction<MedicalFields | { text: string | null }>[];
  previewDocument: DocumentPreview;
  issueDocument: IssuedDocument;
  readDocument: IssuedDocument;
  listPrinters: Printer[];
  printDocument: { documentId: string; submitted: true; auditRecorded?: false };
}
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'SESSION_CHANGED'
  | 'PRINT_FAILED'
  | 'PRINTER_UNAVAILABLE'
  | 'TEMPLATE_UNAVAILABLE';
export type Result<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        message: string;
        fieldErrors?: Record<string, string>;
        currentRevision?: number;
      };
    };
export interface SessionReset {
  generation: number;
  reason: 'account-switch' | 'logout' | 'expired' | 'window-closed';
}
export type ClinicApi = {
  readonly [K in keyof Requests]: Requests[K] extends undefined
    ? () => Promise<Result<Responses[K]>>
    : (input: Requests[K]) => Promise<Result<Responses[K]>>;
} & {
  onSessionReset: (listener: (event: SessionReset) => void) => () => void;
};
export interface DesktopApi {
  readonly platform: string;
  readonly clinic: ClinicApi;
}
declare global {
  interface Window {
    readonly desktop: DesktopApi;
  }
}
