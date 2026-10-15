import type { PatientIdentity } from './clinic-api';

export type LabOrderStatus =
  | 'ordered'
  | 'in_progress'
  | 'resulted'
  | 'reviewed'
  | 'cancelled'
  | 'rejected';
export type LabPriority = 'routine' | 'urgent';
export interface LabValue {
  test: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  flag: 'normal' | 'abnormal' | 'critical' | 'unspecified';
}
export interface LabResult {
  id: string;
  orderId: string;
  authorId: string;
  authorName: string;
  status: 'draft' | 'finalized';
  revision: number;
  values: LabValue[];
  notes: string | null;
  correctionOfId: string | null;
  correctionReason: string | null;
  sourceRevision: number | null;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface LabOrderFields {
  requestedTests: string[];
  clinicalContext: string | null;
  priority: LabPriority;
  requestedFor: string;
}
export interface LabOrder extends LabOrderFields {
  id: string;
  patientId: string;
  patient: PatientIdentity;
  orderingProviderId: string;
  orderingProviderName: string;
  discipline: 'medical' | 'dental';
  status: LabOrderStatus;
  revision: number;
  startedAt: string | null;
  finalizedAt: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  closedAt: string | null;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
  results: LabResult[];
}
type RevisionInput = { id: string; expectedRevision: number };
export interface LabResultFields {
  values: LabValue[];
  notes: string | null;
}
export interface LaboratoryRequests {
  listLabOrders: { patientId: string };
  listLabQueue: { scope: 'pending' | 'all' };
  createLabOrder: { patientId: string } & LabOrderFields;
  startLabOrder: RevisionInput;
  cancelLabOrder: RevisionInput & { reason: string };
  rejectLabOrder: RevisionInput & { reason: string };
  saveLabResult: {
    orderId: string;
    expectedRevision: number;
  } & LabResultFields;
  finalizeLabResult: RevisionInput & { expectedOrderRevision: number };
  correctLabResult: RevisionInput & {
    expectedOrderRevision: number;
    reason: string;
  } & LabResultFields;
  reviewLabOrder: RevisionInput;
}
export interface LaboratoryResponses {
  listLabOrders: LabOrder[];
  listLabQueue: LabOrder[];
  createLabOrder: LabOrder;
  startLabOrder: LabOrder;
  cancelLabOrder: LabOrder;
  rejectLabOrder: LabOrder;
  saveLabResult: LabOrder;
  finalizeLabResult: LabOrder;
  correctLabResult: LabOrder;
  reviewLabOrder: LabOrder;
}
