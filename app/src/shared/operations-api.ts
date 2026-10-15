export const auditActions = [
  'view',
  'create',
  'change',
  'finalize',
  'correction',
  'import',
  'export',
  'print',
] as const;
export type AuditAction = (typeof auditActions)[number];
export interface AuditQuery {
  from: string;
  to: string;
  actorId?: string;
  patientId?: string;
  resourceId?: string;
  action?: AuditAction;
  cursor?: string;
}
export interface AuditEvent {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: string;
  action: AuditAction;
  patientId: string | null;
  resourceType: string;
  resourceId: string | null;
  outcome: 'success' | 'failure';
  source: string;
  workstation: string | null;
  createdAt: string;
}
export interface ReportQuery {
  from: string;
  to: string;
}
export interface ClinicReport {
  from: string;
  to: string;
  generatedAt: string;
  fingerprint: string;
  totals: {
    visits: number;
    noShows: number;
    pendingLabs: number;
    averageLabMinutes: number | null;
    newPatients: number;
  };
  daily: { date: string; visits: number }[];
  sexBreakdown: {
    sex: 'female' | 'male' | 'other' | 'not_recorded';
    patients: number;
  }[];
  departments: {
    discipline: 'medical' | 'dental' | 'laboratory';
    patients: number;
  }[];
}
export interface OperationsRequests {
  listAuditEvents: AuditQuery;
  listAuditActors: undefined;
  readReport: ReportQuery;
  exportReport: ReportQuery & { fingerprint: string };
}
export interface OperationsResponses {
  listAuditEvents: { events: AuditEvent[]; nextCursor: string | null };
  listAuditActors: { id: string; displayName: string }[];
  readReport: ClinicReport;
  exportReport: { filename: string; csv: string; fingerprint: string };
}
