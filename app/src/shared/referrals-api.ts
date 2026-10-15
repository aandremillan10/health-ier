import type { PatientIdentity } from './clinic-api';
import type { LabOrderStatus } from './laboratory-api';

export type ReferralUnit = 'medical' | 'dental' | 'laboratory';
export type ReferralStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected';
export interface ReferralLabOrder {
  id: string;
  requestedTests: string[];
  status: LabOrderStatus;
}
export interface ReferralLabResult {
  id: string;
  orderId: string;
  finalizedAt: string | null;
  correctionOfId: string | null;
  supersededById: string | null;
}
export interface Referral {
  id: string;
  patientId: string;
  patient: PatientIdentity;
  originStaffId: string;
  originStaffName: string;
  originDiscipline: 'medical' | 'dental';
  receivingDiscipline: ReferralUnit;
  reason: string;
  status: ReferralStatus;
  revision: number;
  acceptedAt: string | null;
  acceptedById: string | null;
  acceptedByName: string | null;
  startedAt: string | null;
  startedById: string | null;
  startedByName: string | null;
  completedAt: string | null;
  completedById: string | null;
  completedByName: string | null;
  completionNote: string | null;
  completionReference: string | null;
  closedAt: string | null;
  closedById: string | null;
  closedByName: string | null;
  closeReason: string | null;
  labOrderId: string | null;
  labResultId: string | null;
  labOrder: ReferralLabOrder | null;
  labResult: ReferralLabResult | null;
  createdAt: string;
  updatedAt: string;
}
export interface ReferralFields {
  receivingDiscipline: ReferralUnit;
  reason: string;
  labOrderId: string | null;
}
export interface ReferralCompletion {
  completionNote: string | null;
  completionReference: string | null;
  labResultId: string | null;
}
type RevisionInput = { id: string; expectedRevision: number };
export interface ReferralsRequests {
  listReferrals: { patientId: string };
  listReferralInbox: { scope: 'pending' | 'all' };
  listSentReferrals: { scope: 'pending' | 'all' };
  createReferral: { patientId: string } & ReferralFields;
  acceptReferral: RevisionInput;
  startReferral: RevisionInput;
  completeReferral: RevisionInput & ReferralCompletion;
  cancelReferral: RevisionInput & { reason: string };
  rejectReferral: RevisionInput & { reason: string };
}
export interface ReferralsResponses {
  listReferrals: Referral[];
  listReferralInbox: Referral[];
  listSentReferrals: Referral[];
  createReferral: Referral;
  acceptReferral: Referral;
  startReferral: Referral;
  completeReferral: Referral;
  cancelReferral: Referral;
  rejectReferral: Referral;
}
