import type { PatientIdentity, Result, Staff } from '../../shared/clinic-api';
import type {
  DependentFields,
  DependentLink,
  Eligibility,
  EligibilityFields,
  Membership,
  MembershipApi,
  MembershipFields,
  MembershipHistory,
  MembershipRequests,
} from '../../shared/membership';
import { today } from './format';

export type DemoMembership = MembershipFields & {
  id: string;
  patientId: string;
  authorId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export type DemoDependentLink = DependentFields & {
  id: string;
  membershipId: string;
  authorId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export interface MembershipDemoSnapshot {
  memberships: DemoMembership[];
  dependentLinks: DemoDependentLink[];
}
class DemoFailure extends Error {
  constructor(
    readonly code:
      'VALIDATION' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
    readonly currentRevision?: number,
  ) {
    super(message);
  }
}
function eligible(fields: EligibilityFields, asOf: string): Eligibility {
  if (fields.state === 'inactive') return 'inactive';
  if (asOf < fields.effectiveStart) return 'not_started';
  return fields.effectiveEnd && asOf > fields.effectiveEnd
    ? 'expired'
    : 'eligible';
}
function validateDates(fields: EligibilityFields): void {
  const valid = (value: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (
    !['active', 'inactive'].includes(fields.state) ||
    !valid(fields.effectiveStart) ||
    (fields.effectiveEnd !== null &&
      (!valid(fields.effectiveEnd) ||
        fields.effectiveEnd < fields.effectiveStart))
  )
    throw new DemoFailure(
      'VALIDATION',
      'Check the eligibility state and effective dates. The end date must be on or after the start date.',
    );
}
export function createMembershipDemo(
  getStaff: () => Staff | null,
  getPatient: (id: string) => PatientIdentity | null,
): { api: MembershipApi; snapshot: () => MembershipDemoSnapshot } {
  const memberships = new Map<string, DemoMembership>();
  const links = new Map<string, DemoDependentLink>();
  const revisions = new Map<string, MembershipHistory[]>();
  function staff(write = false, history = false): Staff {
    const person = getStaff();
    if (!person)
      throw new DemoFailure(
        'UNAUTHENTICATED',
        'Sign in to use this synthetic family record.',
      );
    if (
      (write && person.role !== 'clerk') ||
      (!write && person.role === 'medtech' && !person.isHead) ||
      (history && person.role !== 'clerk' && !person.isHead)
    )
      throw new DemoFailure(
        'FORBIDDEN',
        write
          ? 'Only the clerk can maintain membership and dependents.'
          : 'This family information is restricted for your account.',
      );
    return person;
  }
  function patient(id: string): PatientIdentity {
    const person = getPatient(id);
    if (!person)
      throw new DemoFailure(
        'NOT_FOUND',
        'No patient was found. Search the registry and choose an existing patient.',
      );
    return structuredClone(person);
  }
  async function result<T>(operation: () => T): Promise<Result<T>> {
    try {
      return { ok: true, data: structuredClone(operation()) };
    } catch (error) {
      if (error instanceof DemoFailure)
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.currentRevision
              ? { currentRevision: error.currentRevision }
              : {}),
          },
        };
      return {
        ok: false,
        error: {
          code: 'UNAVAILABLE',
          message:
            'The synthetic family action was not confirmed. Refresh the family section and try again.',
        },
      };
    }
  }
  function memberDto(
    item: DemoMembership,
    viewer: Staff,
    asOf: string,
  ): Membership {
    return {
      id: item.id,
      patientId: item.patientId,
      memberNumber:
        viewer.role === 'clerk' || viewer.isHead ? item.memberNumber : null,
      state: item.state,
      effectiveStart: item.effectiveStart,
      effectiveEnd: item.effectiveEnd,
      revision: item.revision,
      eligibility: eligible(item, asOf),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
  function linkDto(
    item: DemoDependentLink,
    viewer: Staff,
    asOf: string,
  ): DependentLink {
    const member = memberships.get(item.membershipId);
    if (!member)
      throw new DemoFailure(
        'NOT_FOUND',
        'The membership is unavailable. Refresh this family record.',
      );
    const membershipEligibility = eligible(member, asOf);
    const own = eligible(item, asOf);
    return {
      id: item.id,
      membershipId: item.membershipId,
      dependentPatientId: item.dependentPatientId,
      relationship: item.relationship,
      state: item.state,
      effectiveStart: item.effectiveStart,
      effectiveEnd: item.effectiveEnd,
      memberNumber:
        viewer.role === 'clerk' || viewer.isHead ? member.memberNumber : null,
      member: patient(member.patientId),
      dependent: patient(item.dependentPatientId),
      revision: item.revision,
      eligibility:
        own === 'eligible' && membershipEligibility !== 'eligible'
          ? 'member_ineligible'
          : own,
      membershipEligibility,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
  function record(
    kind: 'membership' | 'dependent',
    id: string,
    revision: number,
    actor: Staff,
    action: MembershipHistory['action'],
    reason: string | null,
    snapshot: MembershipFields | DependentFields,
  ): void {
    const key = `${kind}:${id}`;
    revisions.set(key, [
      {
        id: crypto.randomUUID(),
        resourceId: id,
        authorId: actor.id,
        authorName: actor.displayName,
        revision,
        action,
        reason,
        snapshot: structuredClone(snapshot),
        createdAt: new Date().toISOString(),
      },
      ...(revisions.get(key) ?? []),
    ]);
  }
  function membershipFields(item: DemoMembership): MembershipFields {
    return {
      memberNumber: item.memberNumber,
      state: item.state,
      effectiveStart: item.effectiveStart,
      effectiveEnd: item.effectiveEnd,
    };
  }
  function dependentFields(item: DemoDependentLink): DependentFields {
    return {
      dependentPatientId: item.dependentPatientId,
      relationship: item.relationship,
      state: item.state,
      effectiveStart: item.effectiveStart,
      effectiveEnd: item.effectiveEnd,
    };
  }
  function checkRevision(
    actual: number,
    expected: number,
    reason: string,
  ): void {
    if (actual !== expected)
      throw new DemoFailure(
        'CONFLICT',
        'This record changed. Cancel the edit and reload before saving.',
        actual,
      );
    if (!reason.trim() || reason.length > 4000)
      throw new DemoFailure(
        'VALIDATION',
        'Enter a reason for this change (up to 4000 characters).',
      );
  }
  function checkMember(
    fields: MembershipFields,
    patientId: string,
    exceptId?: string,
  ): void {
    patient(patientId);
    validateDates(fields);
    if (!fields.memberNumber.trim() || fields.memberNumber.length > 200)
      throw new DemoFailure(
        'VALIDATION',
        'Enter an explicit member reference (up to 200 characters).',
      );
    if (
      [...memberships.values()].some(
        (item) =>
          item.id !== exceptId &&
          (item.patientId === patientId ||
            item.memberNumber === fields.memberNumber.trim()),
      )
    )
      throw new DemoFailure(
        'CONFLICT',
        'This patient or member reference already has a membership. Open that record and update it.',
      );
  }
  function checkLink(fields: DependentFields, membershipId: string): void {
    validateDates(fields);
    const membership = memberships.get(membershipId);
    if (!membership)
      throw new DemoFailure(
        'NOT_FOUND',
        'The member was not found. Search and choose an explicit member record.',
      );
    const member = patient(membership.patientId);
    const dependent = patient(fields.dependentPatientId);
    if (member.id === dependent.id)
      throw new DemoFailure(
        'VALIDATION',
        'A member cannot be their own dependent. Choose another patient.',
      );
    if (!['spouse', 'child', 'parent'].includes(fields.relationship))
      throw new DemoFailure('VALIDATION', 'Choose spouse, child, or parent.');
    if (
      member.dateOfBirth &&
      dependent.dateOfBirth &&
      ((fields.relationship === 'child' &&
        dependent.dateOfBirth <= member.dateOfBirth) ||
        (fields.relationship === 'parent' &&
          dependent.dateOfBirth >= member.dateOfBirth))
    )
      throw new DemoFailure(
        'VALIDATION',
        'The relationship conflicts with the recorded birth dates. Check the selected patients.',
      );
  }
  function checkGraph(
    proposedMemberships: DemoMembership[],
    proposedLinks: DemoDependentLink[],
  ): void {
    const edges = proposedLinks.flatMap((link) => {
      const membership = proposedMemberships.find(
        (item) => item.id === link.membershipId,
      );
      if (
        !membership ||
        membership.state !== 'active' ||
        link.state !== 'active'
      )
        return [];
      const start =
        membership.effectiveStart > link.effectiveStart
          ? membership.effectiveStart
          : link.effectiveStart;
      const end =
        (membership.effectiveEnd ?? '9999-12-31') <
        (link.effectiveEnd ?? '9999-12-31')
          ? (membership.effectiveEnd ?? '9999-12-31')
          : (link.effectiveEnd ?? '9999-12-31');
      return start <= end
        ? [
            {
              memberId: membership.patientId,
              dependentId: link.dependentPatientId,
              start,
              end,
            },
          ]
        : [];
    });
    for (const [index, edge] of edges.entries()) {
      if (
        edges
          .slice(index + 1)
          .some(
            (other) =>
              edge.memberId === other.memberId &&
              edge.dependentId === other.dependentId &&
              edge.start <= other.end &&
              other.start <= edge.end,
          )
      )
        throw new DemoFailure(
          'CONFLICT',
          'An active dependent link already covers these dates. Update its existing record.',
        );
      const queue = [
        {
          id: edge.dependentId,
          start: edge.start,
          end: edge.end,
          visited: new Set([edge.memberId]),
        },
      ];
      while (queue.length) {
        const current = queue.pop()!;
        if (current.visited.has(current.id))
          throw new DemoFailure(
            'VALIDATION',
            'This link creates a circular family relationship. Choose another member or dependent.',
          );
        for (const next of edges.filter(
          (entry) => entry.memberId === current.id,
        )) {
          const start = current.start > next.start ? current.start : next.start;
          const end = current.end < next.end ? current.end : next.end;
          if (start <= end)
            queue.push({
              id: next.dependentId,
              start,
              end,
              visited: new Set([...current.visited, current.id]),
            });
        }
      }
    }
  }
  function changeMembership(
    input: MembershipRequests['updateMembership'],
    action: 'update' | 'correct',
  ): Membership {
    const viewer = staff(true);
    const original = memberships.get(input.id);
    if (!original)
      throw new DemoFailure(
        'NOT_FOUND',
        'The membership is unavailable. Refresh the family section.',
      );
    checkRevision(original.revision, input.expectedRevision, input.reason);
    checkMember(input, original.patientId, original.id);
    const next = {
      ...original,
      memberNumber: input.memberNumber.trim(),
      state: input.state,
      effectiveStart: input.effectiveStart,
      effectiveEnd: input.effectiveEnd,
      revision: original.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    checkGraph(
      [...memberships.values()].map((item) =>
        item.id === next.id ? next : item,
      ),
      [...links.values()],
    );
    memberships.set(next.id, next);
    record(
      'membership',
      next.id,
      next.revision,
      viewer,
      action,
      input.reason.trim(),
      membershipFields(next),
    );
    return memberDto(next, viewer, today());
  }
  function changeLink(
    input:
      | MembershipRequests['updateDependent']
      | MembershipRequests['unlinkDependent'],
    action: 'update' | 'correct' | 'unlink',
  ): DependentLink {
    const viewer = staff(true);
    const original = links.get(input.id);
    if (!original)
      throw new DemoFailure(
        'NOT_FOUND',
        'The dependent link is unavailable. Refresh the family section.',
      );
    checkRevision(original.revision, input.expectedRevision, input.reason);
    if (action === 'unlink' && original.state === 'inactive')
      throw new DemoFailure(
        'CONFLICT',
        'This dependent link is already inactive. View its history or add a correction.',
      );
    const fields =
      'dependentPatientId' in input
        ? {
            dependentPatientId: input.dependentPatientId,
            relationship: input.relationship,
            state: input.state,
            effectiveStart: input.effectiveStart,
            effectiveEnd: input.effectiveEnd,
          }
        : { ...dependentFields(original), state: 'inactive' as const };
    checkLink(fields, original.membershipId);
    const next = {
      ...original,
      ...fields,
      revision: original.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    checkGraph(
      [...memberships.values()],
      [...links.values()].map((item) => (item.id === next.id ? next : item)),
    );
    links.set(next.id, next);
    record(
      'dependent',
      next.id,
      next.revision,
      viewer,
      action,
      input.reason.trim(),
      dependentFields(next),
    );
    return linkDto(next, viewer, today());
  }
  const api: MembershipApi = {
    readPatientFamily: async ({ patientId, asOf = today() }) =>
      result(() => {
        const viewer = staff();
        patient(patientId);
        validateDates({
          state: 'active',
          effectiveStart: asOf,
          effectiveEnd: asOf,
        });
        const membership = [...memberships.values()].find(
          (item) => item.patientId === patientId,
        );
        return {
          patientId,
          asOf,
          canManage: viewer.role === 'clerk',
          canReadHistory: viewer.role === 'clerk' || viewer.isHead,
          membership: membership
            ? {
                ...memberDto(membership, viewer, asOf),
                dependents: [...links.values()]
                  .filter((link) => link.membershipId === membership.id)
                  .map((link) => linkDto(link, viewer, asOf)),
              }
            : null,
          memberOf: [...links.values()]
            .filter((link) => link.dependentPatientId === patientId)
            .map((link) => linkDto(link, viewer, asOf)),
        };
      }),
    createMembership: async ({ patientId, ...fields }) =>
      result(() => {
        const viewer = staff(true);
        checkMember(fields, patientId);
        const now = new Date().toISOString();
        const item: DemoMembership = {
          ...fields,
          memberNumber: fields.memberNumber.trim(),
          id: crypto.randomUUID(),
          patientId,
          authorId: viewer.id,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        };
        memberships.set(item.id, item);
        record(
          'membership',
          item.id,
          item.revision,
          viewer,
          'create',
          null,
          membershipFields(item),
        );
        return memberDto(item, viewer, today());
      }),
    updateMembership: async (input) =>
      result(() => changeMembership(input, 'update')),
    correctMembership: async (input) =>
      result(() => changeMembership(input, 'correct')),
    linkDependent: async ({ membershipId, ...fields }) =>
      result(() => {
        const viewer = staff(true);
        checkLink(fields, membershipId);
        const now = new Date().toISOString();
        const item: DemoDependentLink = {
          ...fields,
          id: crypto.randomUUID(),
          membershipId,
          authorId: viewer.id,
          revision: 1,
          createdAt: now,
          updatedAt: now,
        };
        checkGraph([...memberships.values()], [...links.values(), item]);
        links.set(item.id, item);
        record(
          'dependent',
          item.id,
          item.revision,
          viewer,
          'create',
          null,
          dependentFields(item),
        );
        return linkDto(item, viewer, today());
      }),
    updateDependent: async (input) => result(() => changeLink(input, 'update')),
    correctDependent: async (input) =>
      result(() => changeLink(input, 'correct')),
    unlinkDependent: async (input) => result(() => changeLink(input, 'unlink')),
    readMembershipHistory: async ({ id }) =>
      result(() => {
        staff(false, true);
        if (!memberships.has(id))
          throw new DemoFailure(
            'NOT_FOUND',
            'The membership was not found. Refresh the family section.',
          );
        return revisions.get(`membership:${id}`) ?? [];
      }),
    readDependentHistory: async ({ id }) =>
      result(() => {
        staff(false, true);
        if (!links.has(id))
          throw new DemoFailure(
            'NOT_FOUND',
            'The dependent link was not found. Refresh the family section.',
          );
        return revisions.get(`dependent:${id}`) ?? [];
      }),
  };
  return {
    api,
    snapshot: () =>
      structuredClone({
        memberships: [...memberships.values()],
        dependentLinks: [...links.values()],
      }),
  };
}
