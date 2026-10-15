import type { PatientIdentity, Result } from './clinic-api';

export type Eligibility =
  'eligible' | 'inactive' | 'not_started' | 'expired' | 'member_ineligible';
export interface EligibilityFields {
  state: 'active' | 'inactive';
  effectiveStart: string;
  effectiveEnd: string | null;
}
export interface MembershipFields extends EligibilityFields {
  memberNumber: string;
}
export interface DependentFields extends EligibilityFields {
  dependentPatientId: string;
  relationship: 'spouse' | 'child' | 'parent';
}
export interface Membership extends EligibilityFields {
  id: string;
  patientId: string;
  memberNumber: string | null;
  revision: number;
  eligibility: Eligibility;
  createdAt: string;
  updatedAt: string;
}
export interface DependentLink extends DependentFields {
  id: string;
  membershipId: string;
  memberNumber: string | null;
  member: PatientIdentity;
  dependent: PatientIdentity;
  revision: number;
  eligibility: Eligibility;
  membershipEligibility: Eligibility;
  createdAt: string;
  updatedAt: string;
}
export interface PatientFamily {
  patientId: string;
  asOf: string;
  canManage: boolean;
  canReadHistory: boolean;
  membership: (Membership & { dependents: DependentLink[] }) | null;
  memberOf: DependentLink[];
}
export interface MembershipHistory {
  id: string;
  resourceId: string;
  authorId: string;
  authorName: string;
  revision: number;
  action: 'create' | 'update' | 'correct' | 'unlink';
  reason: string | null;
  snapshot: MembershipFields | DependentFields;
  createdAt: string;
}
export interface MembershipRequests {
  readPatientFamily: { patientId: string; asOf?: string };
  createMembership: MembershipFields & { patientId: string };
  updateMembership: MembershipFields & {
    id: string;
    expectedRevision: number;
    reason: string;
  };
  correctMembership: MembershipFields & {
    id: string;
    expectedRevision: number;
    reason: string;
  };
  linkDependent: DependentFields & { membershipId: string };
  updateDependent: DependentFields & {
    id: string;
    expectedRevision: number;
    reason: string;
  };
  correctDependent: DependentFields & {
    id: string;
    expectedRevision: number;
    reason: string;
  };
  unlinkDependent: { id: string; expectedRevision: number; reason: string };
  readMembershipHistory: { id: string };
  readDependentHistory: { id: string };
}
export interface MembershipResponses {
  readPatientFamily: PatientFamily;
  createMembership: Membership;
  updateMembership: Membership;
  correctMembership: Membership;
  linkDependent: DependentLink;
  updateDependent: DependentLink;
  correctDependent: DependentLink;
  unlinkDependent: DependentLink;
  readMembershipHistory: MembershipHistory[];
  readDependentHistory: MembershipHistory[];
}
export type MembershipApi = {
  readonly [K in keyof MembershipRequests]: (
    input: MembershipRequests[K],
  ) => Promise<Result<MembershipResponses[K]>>;
};
