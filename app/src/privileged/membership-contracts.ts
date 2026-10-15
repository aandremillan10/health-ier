import type { PatientIdentity } from '../shared/clinic-api';
import type {
  DependentFields,
  DependentLink,
  EligibilityFields,
  Membership,
  MembershipFields,
  MembershipHistory,
  MembershipRequests,
  MembershipResponses,
  PatientFamily,
} from '../shared/membership';
import {
  array,
  boolean,
  choice,
  date,
  type Guard,
  nullable,
  object,
  optional,
  record,
  revision,
  text,
  timestamp,
  uuid,
} from './validation';

const requiredText: Guard<string> = (value): string => {
  const parsed = text(200, 1)(value);
  if (!parsed.trim()) throw new Error('Required text');
  return parsed;
};
const eligibilityFields = {
  state: choice(['active', 'inactive']),
  effectiveStart: date,
  effectiveEnd: nullable(date),
} satisfies { [K in keyof EligibilityFields]: Guard<EligibilityFields[K]> };
const membershipFields = {
  ...eligibilityFields,
  memberNumber: requiredText,
} satisfies { [K in keyof MembershipFields]: Guard<MembershipFields[K]> };
const dependentFields = {
  ...eligibilityFields,
  dependentPatientId: uuid,
  relationship: choice(['spouse', 'child', 'parent']),
} satisfies { [K in keyof DependentFields]: Guard<DependentFields[K]> };
function ordered<T extends EligibilityFields>(guard: Guard<T>): Guard<T> {
  return (value): T => {
    const parsed = guard(value);
    if (parsed.effectiveEnd && parsed.effectiveEnd < parsed.effectiveStart)
      throw new Error('Eligibility date order');
    return parsed;
  };
}
const patient = object<PatientIdentity>({
  id: uuid,
  revision,
  fullName: text(200, 1),
  sex: nullable(text(50)),
  dateOfBirth: nullable(date),
});
const eligibility = choice([
  'eligible',
  'inactive',
  'not_started',
  'expired',
  'member_ineligible',
]);
const membershipDtoFields = {
  ...eligibilityFields,
  id: uuid,
  patientId: uuid,
  memberNumber: nullable(requiredText),
  revision,
  eligibility,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const membership = ordered(object<Membership>(membershipDtoFields));
const dependentDtoFields = {
  ...dependentFields,
  id: uuid,
  membershipId: uuid,
  memberNumber: nullable(requiredText),
  member: patient,
  dependent: patient,
  revision,
  eligibility,
  membershipEligibility: eligibility,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const parseDependent = ordered(object<DependentLink>(dependentDtoFields));
const dependent: Guard<DependentLink> = (value): DependentLink => {
  const parsed = parseDependent(value);
  if (
    parsed.dependentPatientId !== parsed.dependent.id ||
    parsed.member.id === parsed.dependent.id
  )
    throw new Error('Family identity mismatch');
  return parsed;
};
const family = object<PatientFamily>({
  patientId: uuid,
  asOf: date,
  canManage: boolean,
  canReadHistory: boolean,
  membership: nullable(
    ordered(
      object<Membership & { dependents: DependentLink[] }>({
        ...membershipDtoFields,
        dependents: array(dependent),
      }),
    ),
  ),
  memberOf: array(dependent),
});
const snapshot: Guard<MembershipFields | DependentFields> = (
  value,
): MembershipFields | DependentFields =>
  Object.hasOwn(record(value), 'memberNumber')
    ? ordered(object<MembershipFields>(membershipFields))(value)
    : ordered(object<DependentFields>(dependentFields))(value);
const history = array(
  object<MembershipHistory>({
    id: uuid,
    resourceId: uuid,
    authorId: uuid,
    authorName: text(200, 1),
    revision,
    action: choice(['create', 'update', 'correct', 'unlink']),
    reason: nullable(text(4000)),
    snapshot,
    createdAt: timestamp,
  }),
);
const change = { id: uuid, expectedRevision: revision, reason: text(4000, 1) };
export const membershipRequestGuards = {
  readPatientFamily: object<MembershipRequests['readPatientFamily']>({
    patientId: uuid,
    asOf: optional(date),
  }),
  createMembership: ordered(
    object<MembershipRequests['createMembership']>({
      patientId: uuid,
      ...membershipFields,
    }),
  ),
  updateMembership: ordered(
    object<MembershipRequests['updateMembership']>({
      ...membershipFields,
      ...change,
    }),
  ),
  correctMembership: ordered(
    object<MembershipRequests['correctMembership']>({
      ...membershipFields,
      ...change,
    }),
  ),
  linkDependent: ordered(
    object<MembershipRequests['linkDependent']>({
      membershipId: uuid,
      ...dependentFields,
    }),
  ),
  updateDependent: ordered(
    object<MembershipRequests['updateDependent']>({
      ...dependentFields,
      ...change,
    }),
  ),
  correctDependent: ordered(
    object<MembershipRequests['correctDependent']>({
      ...dependentFields,
      ...change,
    }),
  ),
  unlinkDependent: object<MembershipRequests['unlinkDependent']>(change),
  readMembershipHistory: object<MembershipRequests['readMembershipHistory']>({
    id: uuid,
  }),
  readDependentHistory: object<MembershipRequests['readDependentHistory']>({
    id: uuid,
  }),
} satisfies { [K in keyof MembershipRequests]: Guard<MembershipRequests[K]> };
export const membershipResponseGuards = {
  readPatientFamily: (value: unknown): PatientFamily => {
    const parsed = family(value);
    if (
      (parsed.membership &&
        (parsed.membership.patientId !== parsed.patientId ||
          parsed.membership.dependents.some(
            (link) =>
              link.membershipId !== parsed.membership!.id ||
              link.member.id !== parsed.patientId,
          ))) ||
      parsed.memberOf.some(
        (link) => link.dependentPatientId !== parsed.patientId,
      )
    )
      throw new Error('Family patient mismatch');
    return parsed;
  },
  createMembership: membership,
  updateMembership: membership,
  correctMembership: membership,
  linkDependent: dependent,
  updateDependent: dependent,
  correctDependent: dependent,
  unlinkDependent: dependent,
  readMembershipHistory: history,
  readDependentHistory: history,
} satisfies { [K in keyof MembershipResponses]: Guard<MembershipResponses[K]> };
export function membershipRoute(
  name: keyof MembershipRequests,
  input: MembershipRequests[keyof MembershipRequests],
): { path: string; method: 'GET' | 'POST' | 'PATCH'; body?: unknown } {
  switch (name) {
    case 'readPatientFamily': {
      const parsed = membershipRequestGuards.readPatientFamily(input);
      return {
        path: `/patients/${parsed.patientId}/family${parsed.asOf ? `?asOf=${parsed.asOf}` : ''}`,
        method: 'GET',
      };
    }
    case 'createMembership': {
      const { patientId, ...body } =
        membershipRequestGuards.createMembership(input);
      return {
        path: `/patients/${patientId}/membership`,
        method: 'POST',
        body,
      };
    }
    case 'updateMembership':
    case 'correctMembership': {
      const { id, ...body } = membershipRequestGuards[name](input);
      return {
        path: `/memberships/${id}${name === 'correctMembership' ? '/corrections' : ''}`,
        method: name === 'correctMembership' ? 'POST' : 'PATCH',
        body,
      };
    }
    case 'linkDependent': {
      const { membershipId, ...body } =
        membershipRequestGuards.linkDependent(input);
      return {
        path: `/memberships/${membershipId}/dependents`,
        method: 'POST',
        body,
      };
    }
    case 'updateDependent':
    case 'correctDependent': {
      const { id, ...body } = membershipRequestGuards[name](input);
      return {
        path: `/dependent-links/${id}${name === 'correctDependent' ? '/corrections' : ''}`,
        method: name === 'correctDependent' ? 'POST' : 'PATCH',
        body,
      };
    }
    case 'unlinkDependent': {
      const { id, ...body } = membershipRequestGuards.unlinkDependent(input);
      return { path: `/dependent-links/${id}/unlink`, method: 'POST', body };
    }
    case 'readMembershipHistory':
    case 'readDependentHistory': {
      const { id } = membershipRequestGuards[name](input);
      return {
        path: `/${name === 'readMembershipHistory' ? 'memberships' : 'dependent-links'}/${id}/history`,
        method: 'GET',
      };
    }
  }
}
