import { Injectable } from '@nestjs/common';
import { recordAudit } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { serverMode } from '../config';
import { fail } from '../errors';
import type {
  DependentLink,
  Membership,
  Patient,
  Prisma,
} from '../generated/prisma/client';
import type { Principal } from '../mirror-contract';
import { dateOnly, object, revision, text, uuid } from '../validation';
import {
  dependentFields,
  eligibilityFields,
  eligibilityOn,
  manilaToday,
  membershipFields,
  validateFamilyGraph,
  validateRelationship,
} from './membership.rules';
import type {
  DependentDto,
  DependentFields,
  EligibilityFields,
  FamilyPatient,
  MembershipDto,
  MembershipFields,
  MembershipHistory,
  PatientFamily,
} from './membership.types';

const eligibilityKeys = ['state', 'effectiveStart', 'effectiveEnd'];
const membershipKeys = ['memberNumber', ...eligibilityKeys];
const dependentKeys = [
  'dependentPatientId',
  'relationship',
  ...eligibilityKeys,
];
const historyAllowed = (staff: Principal): boolean =>
  staff.role === 'clerk' || staff.isHead;
function authorize(staff: Principal, write = false): void {
  if (serverMode() !== 'EDGE')
    fail(403, 'EDGE_ONLY', 'Use the clinic server to access HMO membership.');
  if (
    write ? staff.role !== 'clerk' : staff.role === 'medtech' && !staff.isHead
  )
    fail(
      403,
      'FORBIDDEN',
      write
        ? 'Only the clerk can maintain HMO membership and dependents.'
        : 'HMO family records are restricted for this account.',
    );
}
function identity(patient: Patient): FamilyPatient {
  return {
    id: patient.id,
    revision: patient.revision,
    fullName: patient.fullName,
    sex: patient.sex,
    dateOfBirth: patient.dateOfBirth,
  };
}
function dto(
  staff: Principal,
  membership: Membership,
  asOf: string,
): MembershipDto {
  return {
    id: membership.id,
    patientId: membership.patientId,
    memberNumber: historyAllowed(staff) ? membership.memberNumber : null,
    ...eligibilityFields(membership),
    revision: membership.revision,
    eligibility: eligibilityOn(membership as EligibilityFields, asOf),
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
  };
}
type LinkWithPeople = DependentLink & {
  dependent: Patient;
  membership: Membership & { patient: Patient };
};
function linkDto(
  staff: Principal,
  link: LinkWithPeople,
  asOf: string,
): DependentDto {
  const membershipEligibility = eligibilityOn(
    link.membership as EligibilityFields,
    asOf,
  );
  const own = eligibilityOn(link as EligibilityFields, asOf);
  return {
    id: link.id,
    membershipId: link.membershipId,
    ...dependentFields(link),
    memberNumber: historyAllowed(staff) ? link.membership.memberNumber : null,
    member: identity(link.membership.patient),
    dependent: identity(link.dependent),
    revision: link.revision,
    eligibility:
      own === 'eligible' && membershipEligibility !== 'eligible'
        ? 'member_ineligible'
        : own,
    membershipEligibility,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  };
}
@Injectable()
export class MembershipService {
  constructor(private readonly db: DatabaseService) {}
  async family(
    staff: Principal,
    patientId: string,
    requestedDate: unknown,
  ): Promise<PatientFamily> {
    authorize(staff);
    const asOf =
      requestedDate === undefined
        ? manilaToday()
        : dateOnly(requestedDate, 'asOf');
    return this.db.$transaction(
      async (tx) => {
        await this.patient(tx, patientId);
        const membership = await tx.membership.findUnique({
          where: { patientId },
          include: {
            patient: true,
            dependents: {
              include: { dependent: true },
              orderBy: [{ state: 'asc' }, { createdAt: 'desc' }],
            },
          },
        });
        const memberOf = await tx.dependentLink.findMany({
          where: { dependentPatientId: patientId },
          include: {
            dependent: true,
            membership: { include: { patient: true } },
          },
          orderBy: [{ state: 'asc' }, { createdAt: 'desc' }],
        });
        return {
          patientId,
          asOf,
          canManage: staff.role === 'clerk',
          canReadHistory: historyAllowed(staff),
          membership: membership
            ? {
                ...dto(staff, membership, asOf),
                dependents: membership.dependents.map((link) =>
                  linkDto(staff, { ...link, membership }, asOf),
                ),
              }
            : null,
          memberOf: memberOf.map((link) => linkDto(staff, link, asOf)),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async create(
    staff: Principal,
    patientId: string,
    input: unknown,
  ): Promise<MembershipDto> {
    authorize(staff, true);
    const fields = membershipFields(object(input, membershipKeys));
    return this.write(async (tx) => {
      await this.patient(tx, patientId);
      if (await tx.membership.findUnique({ where: { patientId } }))
        fail(
          409,
          'MEMBERSHIP_EXISTS',
          'This patient already has a membership. Update its eligibility instead.',
        );
      await this.memberNumber(tx, fields.memberNumber);
      const item = await tx.membership.create({
        data: { patientId, authorId: staff.id, ...fields },
      });
      await this.membershipHistory(tx, item, staff.id, 'create', null);
      await recordAudit(tx, staff, {
        action: 'create',
        resourceType: 'membership',
        resourceId: item.id,
        patientId: item.patientId,
      });
      return dto(staff, item, manilaToday());
    });
  }
  async changeMembership(
    staff: Principal,
    id: string,
    input: unknown,
    action: 'update' | 'correct',
  ): Promise<MembershipDto> {
    authorize(staff, true);
    uuid(id);
    const body = object(input, [
      ...membershipKeys,
      'expectedRevision',
      'reason',
    ]);
    const wanted = revision(body.expectedRevision);
    const reason = text(body.reason, 'reason', true)!;
    const fields = membershipFields(body);
    return this.write(async (tx) => {
      const original = await tx.membership.findUnique({ where: { id } });
      if (!original)
        fail(
          404,
          'NOT_FOUND',
          'The membership is unavailable. Refresh the family section.',
        );
      this.expected(original.revision, wanted);
      await this.memberNumber(tx, fields.memberNumber, id);
      const item = await tx.membership.update({
        where: { id },
        data: { ...fields, revision: { increment: 1 } },
      });
      await this.validateGraph(tx);
      await this.membershipHistory(tx, item, staff.id, action, reason);
      await recordAudit(tx, staff, {
        action: action === 'correct' ? 'correction' : 'change',
        resourceType: 'membership',
        resourceId: item.id,
        patientId: item.patientId,
      });
      return dto(staff, item, manilaToday());
    });
  }
  async link(
    staff: Principal,
    membershipId: string,
    input: unknown,
  ): Promise<DependentDto> {
    authorize(staff, true);
    uuid(membershipId, 'membershipId');
    const fields = dependentFields(object(input, dependentKeys));
    return this.write(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id: membershipId },
        include: { patient: true },
      });
      if (!membership)
        fail(
          404,
          'NOT_FOUND',
          'The member was not found. Search and choose an explicit member record.',
        );
      const dependent = await this.patient(tx, fields.dependentPatientId);
      validateRelationship(
        identity(membership.patient),
        identity(dependent),
        fields.relationship,
      );
      const item = await tx.dependentLink.create({
        data: { membershipId, authorId: staff.id, ...fields },
        include: {
          dependent: true,
          membership: { include: { patient: true } },
        },
      });
      await this.validateGraph(tx);
      await this.linkHistory(tx, item, staff.id, 'create', null);
      await recordAudit(tx, staff, {
        action: 'create',
        resourceType: 'dependent-link',
        resourceId: item.id,
        patientId: item.dependentPatientId,
      });
      return linkDto(staff, item, manilaToday());
    });
  }
  async changeLink(
    staff: Principal,
    id: string,
    input: unknown,
    action: 'update' | 'correct' | 'unlink',
  ): Promise<DependentDto> {
    authorize(staff, true);
    uuid(id);
    const body = object(
      input,
      action === 'unlink'
        ? ['expectedRevision', 'reason']
        : [...dependentKeys, 'expectedRevision', 'reason'],
    );
    const wanted = revision(body.expectedRevision);
    const reason = text(body.reason, 'reason', true)!;
    const fields = action === 'unlink' ? null : dependentFields(body);
    return this.write(async (tx) => {
      const original = await tx.dependentLink.findUnique({
        where: { id },
        include: { membership: { include: { patient: true } } },
      });
      if (!original)
        fail(
          404,
          'NOT_FOUND',
          'The dependent link is unavailable. Refresh the family section.',
        );
      this.expected(original.revision, wanted);
      if (action === 'unlink' && original.state === 'inactive')
        fail(
          409,
          'LIFECYCLE_CONFLICT',
          'The dependent link is already inactive. Open its history or correct it.',
        );
      const dependent = await this.patient(
        tx,
        fields?.dependentPatientId ?? original.dependentPatientId,
      );
      validateRelationship(
        identity(original.membership.patient),
        identity(dependent),
        fields?.relationship ??
          (original.relationship as DependentFields['relationship']),
      );
      const item = await tx.dependentLink.update({
        where: { id },
        data: {
          ...(fields ?? { state: 'inactive' }),
          revision: { increment: 1 },
        },
        include: {
          dependent: true,
          membership: { include: { patient: true } },
        },
      });
      await this.validateGraph(tx);
      await this.linkHistory(tx, item, staff.id, action, reason);
      await recordAudit(tx, staff, {
        action: action === 'correct' ? 'correction' : 'change',
        resourceType: 'dependent-link',
        resourceId: item.id,
        patientId: item.dependentPatientId,
      });
      return linkDto(staff, item, manilaToday());
    });
  }
  async history(
    staff: Principal,
    id: string,
    kind: 'membership' | 'dependent',
  ): Promise<MembershipHistory[]> {
    authorize(staff);
    if (!historyAllowed(staff))
      fail(
        403,
        'FORBIDDEN',
        'Membership history is restricted to the clerk and clinic head oversight.',
      );
    uuid(id);
    if (kind === 'membership') {
      if (
        !(await this.db.membership.findUnique({
          where: { id },
          select: { id: true },
        }))
      )
        fail(
          404,
          'NOT_FOUND',
          'The membership is unavailable. Refresh the family section.',
        );
      const events = await this.db.membershipRevision.findMany({
        where: { membershipId: id },
        include: { author: { select: { displayName: true } } },
        orderBy: { revision: 'desc' },
      });
      return events.map((event) => ({
        id: event.id,
        resourceId: id,
        authorId: event.authorId,
        authorName: event.author.displayName,
        revision: event.revision,
        action: event.action as MembershipHistory['action'],
        reason: event.reason,
        snapshot: membershipFields(object(event.snapshot, membershipKeys)),
        createdAt: event.createdAt.toISOString(),
      }));
    }
    if (
      !(await this.db.dependentLink.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      fail(
        404,
        'NOT_FOUND',
        'The dependent link is unavailable. Refresh the family section.',
      );
    const events = await this.db.dependentLinkRevision.findMany({
      where: { linkId: id },
      include: { author: { select: { displayName: true } } },
      orderBy: { revision: 'desc' },
    });
    return events.map((event) => ({
      id: event.id,
      resourceId: id,
      authorId: event.authorId,
      authorName: event.author.displayName,
      revision: event.revision,
      action: event.action as MembershipHistory['action'],
      reason: event.reason,
      snapshot: dependentFields(object(event.snapshot, dependentKeys)),
      createdAt: event.createdAt.toISOString(),
    }));
  }
  private async write<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(async (tx) => {
      // One clinic-wide lock prevents concurrent link edits from bypassing graph validation.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(180018)`;
      return work(tx);
    });
  }
  private async patient(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<Patient> {
    const patient = await tx.patient.findUnique({
      where: { id: uuid(id, 'patientId') },
    });
    if (!patient)
      fail(
        404,
        'NOT_FOUND',
        'The patient was not found. Search the registry and choose a patient.',
      );
    return patient;
  }
  private expected(currentRevision: number, expectedRevision: number): void {
    if (currentRevision !== expectedRevision)
      fail(
        409,
        'STALE_REVISION',
        'This family record changed. Cancel the edit and reload before saving.',
        { currentRevision },
      );
  }
  private async memberNumber(
    tx: Prisma.TransactionClient,
    memberNumber: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await tx.membership.findUnique({
      where: { memberNumber },
      select: { id: true },
    });
    if (existing && existing.id !== exceptId)
      fail(
        409,
        'MEMBER_NUMBER_EXISTS',
        'This member reference is already assigned. Search the correct member or enter a different reference.',
      );
  }
  private async validateGraph(tx: Prisma.TransactionClient): Promise<void> {
    const memberships = await tx.membership.findMany({
      where: { state: 'active' },
      include: { dependents: { where: { state: 'active' } } },
    });
    validateFamilyGraph(
      memberships.flatMap((membership) =>
        membership.dependents.flatMap((link) => {
          const start =
            membership.effectiveStart > link.effectiveStart
              ? membership.effectiveStart
              : link.effectiveStart;
          const end =
            membership.effectiveEnd && link.effectiveEnd
              ? membership.effectiveEnd < link.effectiveEnd
                ? membership.effectiveEnd
                : link.effectiveEnd
              : (membership.effectiveEnd ?? link.effectiveEnd);
          return !end || start <= end
            ? [
                {
                  id: link.id,
                  memberId: membership.patientId,
                  dependentId: link.dependentPatientId,
                  start,
                  end,
                },
              ]
            : [];
        }),
      ),
    );
  }
  private async membershipHistory(
    tx: Prisma.TransactionClient,
    item: Membership,
    authorId: string,
    action: MembershipHistory['action'],
    reason: string | null,
  ): Promise<void> {
    const snapshot: MembershipFields = {
      ...eligibilityFields(item),
      memberNumber: item.memberNumber,
    };
    await tx.membershipRevision.create({
      data: {
        membershipId: item.id,
        authorId,
        revision: item.revision,
        action,
        reason,
        snapshot: { ...snapshot },
      },
    });
  }
  private async linkHistory(
    tx: Prisma.TransactionClient,
    item: DependentLink,
    authorId: string,
    action: MembershipHistory['action'],
    reason: string | null,
  ): Promise<void> {
    const snapshot = dependentFields(item);
    await tx.dependentLinkRevision.create({
      data: {
        linkId: item.id,
        authorId,
        revision: item.revision,
        action,
        reason,
        snapshot: { ...snapshot },
      },
    });
  }
}
