import { fail } from '../errors';
import { dateOnly, invalid, text, uuid } from '../validation';
import type {
  DependentFields,
  Eligibility,
  EligibilityFields,
  FamilyPatient,
  MembershipFields,
} from './membership.types';

export function eligibilityOn(
  fields: EligibilityFields,
  asOf: string,
): Eligibility {
  if (fields.state === 'inactive') return 'inactive';
  if (asOf < fields.effectiveStart) return 'not_started';
  if (fields.effectiveEnd && asOf > fields.effectiveEnd) return 'expired';
  return 'eligible';
}
export function manilaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
export function eligibilityFields(
  body: Record<string, unknown>,
): EligibilityFields {
  if (body.state !== 'active' && body.state !== 'inactive') invalid('state');
  const effectiveStart = dateOnly(body.effectiveStart, 'effectiveStart');
  const effectiveEnd =
    body.effectiveEnd === null
      ? null
      : dateOnly(body.effectiveEnd, 'effectiveEnd');
  if (effectiveEnd && effectiveEnd < effectiveStart) invalid('effectiveEnd');
  return { state: body.state, effectiveStart, effectiveEnd };
}
export function membershipFields(
  body: Record<string, unknown>,
): MembershipFields {
  return {
    ...eligibilityFields(body),
    memberNumber: text(body.memberNumber, 'memberNumber', true, 200)!,
  };
}
export function dependentFields(
  body: Record<string, unknown>,
): DependentFields {
  if (
    body.relationship !== 'spouse' &&
    body.relationship !== 'child' &&
    body.relationship !== 'parent'
  )
    invalid('relationship');
  return {
    ...eligibilityFields(body),
    dependentPatientId: uuid(body.dependentPatientId, 'dependentPatientId'),
    relationship: body.relationship,
  };
}
export function validateRelationship(
  member: FamilyPatient,
  dependent: FamilyPatient,
  relationship: DependentFields['relationship'],
): void {
  if (member.id === dependent.id)
    fail(400, 'VALIDATION', 'A member cannot be their own dependent.', {
      fieldErrors: { dependentPatientId: 'Choose another patient.' },
    });
  if (
    member.dateOfBirth &&
    dependent.dateOfBirth &&
    ((relationship === 'child' &&
      dependent.dateOfBirth <= member.dateOfBirth) ||
      (relationship === 'parent' &&
        dependent.dateOfBirth >= member.dateOfBirth))
  )
    fail(
      400,
      'VALIDATION',
      'The relationship conflicts with the recorded birth dates. Check the patient and relationship.',
      {
        fieldErrors: {
          relationship: 'Check the relationship and birth dates.',
        },
      },
    );
}
export interface FamilyEdge {
  id: string;
  memberId: string;
  dependentId: string;
  start: string;
  end: string | null;
}
export function validateFamilyGraph(edges: FamilyEdge[]): void {
  const last = (end: string | null): string => end ?? '9999-12-31';
  for (let index = 0; index < edges.length; index++) {
    const edge = edges[index];
    for (const other of edges.slice(index + 1)) {
      if (
        edge.memberId === other.memberId &&
        edge.dependentId === other.dependentId &&
        edge.start <= last(other.end) &&
        other.start <= last(edge.end)
      )
        fail(
          409,
          'RELATIONSHIP_CONFLICT',
          'An active relationship already covers these dates. Open the existing link to update it.',
        );
    }
    const queue = [
      {
        patientId: edge.dependentId,
        start: edge.start,
        end: last(edge.end),
        path: new Set([edge.memberId]),
      },
    ];
    while (queue.length) {
      const current = queue.pop()!;
      if (current.path.has(current.patientId))
        fail(
          400,
          'VALIDATION',
          'This link creates a circular family relationship. Check the selected member and dependent.',
          {
            fieldErrors: {
              dependentPatientId:
                'Choose a patient outside this membership cycle.',
            },
          },
        );
      const path = new Set([...current.path, current.patientId]);
      for (const next of edges) {
        if (next.memberId !== current.patientId) continue;
        const start = current.start > next.start ? current.start : next.start;
        const end = current.end < last(next.end) ? current.end : last(next.end);
        if (start <= end)
          queue.push({ patientId: next.dependentId, start, end, path });
      }
    }
  }
}
