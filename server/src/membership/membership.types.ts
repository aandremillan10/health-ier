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
export type Eligibility =
  'eligible' | 'inactive' | 'not_started' | 'expired' | 'member_ineligible';
export interface FamilyPatient {
  id: string;
  revision: number;
  fullName: string;
  sex: string | null;
  dateOfBirth: string | null;
}
export interface MembershipDto extends EligibilityFields {
  id: string;
  patientId: string;
  memberNumber: string | null;
  revision: number;
  eligibility: Eligibility;
  createdAt: string;
  updatedAt: string;
}
export interface DependentDto extends DependentFields {
  id: string;
  membershipId: string;
  memberNumber: string | null;
  member: FamilyPatient;
  dependent: FamilyPatient;
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
  membership: (MembershipDto & { dependents: DependentDto[] }) | null;
  memberOf: DependentDto[];
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
