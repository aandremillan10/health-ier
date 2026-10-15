import { Injectable } from '@nestjs/common';
import { recordAudit } from '../audit/audit.service';
import { serverMode } from '../config';
import { DatabaseService } from '../database/database.service';
import { fail } from '../errors';
import type { Prisma, Referral } from '../generated/prisma/client';
import type { Principal } from '../mirror-contract';
import { invalid, object, revision, text, uuid } from '../validation';

type ReferralDates =
  | 'acceptedAt'
  | 'startedAt'
  | 'completedAt'
  | 'closedAt'
  | 'createdAt'
  | 'updatedAt';
export type ReferralDto = Omit<Referral, ReferralDates> & {
  acceptedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  originStaffName: string;
  acceptedByName: string | null;
  startedByName: string | null;
  completedByName: string | null;
  closedByName: string | null;
  patient: {
    id: string;
    revision: number;
    fullName: string;
    sex: string | null;
    dateOfBirth: string | null;
  };
  labOrder: { id: string; requestedTests: string[]; status: string } | null;
  labResult: {
    id: string;
    orderId: string;
    finalizedAt: string | null;
    correctionOfId: string | null;
    supersededById: string | null;
  } | null;
};
type Action = 'accept' | 'start' | 'complete' | 'cancel' | 'reject';
function deny(): never {
  return fail(
    403,
    'FORBIDDEN',
    'This referral action is not permitted for your account.',
  );
}
function unit(staff: Principal): 'medical' | 'dental' | 'laboratory' {
  if (staff.role === 'doctor') return 'medical';
  if (staff.role === 'dentist') return 'dental';
  if (staff.role === 'medtech') return 'laboratory';
  return deny();
}
function access(staff: Principal): void {
  if (serverMode() !== 'EDGE')
    fail(403, 'EDGE_ONLY', 'Use the clinic server for referrals.');
  unit(staff);
}
function canRead(staff: Principal, record: Referral): boolean {
  return (
    staff.isHead ||
    record.originStaffId === staff.id ||
    record.receivingDiscipline === unit(staff)
  );
}
function expected(record: { revision: number }, wanted: number): void {
  if (record.revision !== wanted)
    fail(
      409,
      'STALE_REVISION',
      'This referral changed. Reload it before you retry.',
      { currentRevision: record.revision },
    );
}
function state(record: Referral, allowed: string[]): void {
  if (!allowed.includes(record.status))
    fail(
      409,
      'LIFECYCLE_CONFLICT',
      'This action is no longer available. Reload the referral.',
    );
}
function scopeWhere(scope: unknown): { status?: { in: string[] } } {
  if (scope !== undefined && scope !== 'pending' && scope !== 'all')
    invalid('scope');
  return scope === 'all'
    ? {}
    : { status: { in: ['pending', 'accepted', 'in_progress'] } };
}

@Injectable()
export class ReferralsService {
  constructor(private readonly db: DatabaseService) {}
  private async find(
    tx: Prisma.TransactionClient,
    staff: Principal,
    id: string,
  ): Promise<Referral> {
    const record = await tx.referral.findUnique({ where: { id: uuid(id) } });
    if (!record || !canRead(staff, record))
      fail(404, 'NOT_FOUND', 'Referral not found.');
    return record;
  }
  private async name(
    tx: Prisma.TransactionClient,
    id: string | null,
  ): Promise<string | null> {
    if (!id) return null;
    const author = await tx.staff.findUnique({
      where: { id },
      select: { displayName: true },
    });
    return author?.displayName ?? null;
  }
  private async dto(
    tx: Prisma.TransactionClient,
    record: Referral,
  ): Promise<ReferralDto> {
    const patient = await tx.patient.findUnique({
      where: { id: record.patientId },
      select: {
        id: true,
        revision: true,
        fullName: true,
        sex: true,
        dateOfBirth: true,
      },
    });
    if (!patient) fail(404, 'NOT_FOUND', 'Patient identity is unavailable.');
    const labOrder = record.labOrderId
      ? await tx.labOrder.findUnique({
          where: { id: record.labOrderId },
          select: { id: true, requestedTests: true, status: true },
        })
      : null;
    const labResult = record.labResultId
      ? await tx.labResult.findUnique({ where: { id: record.labResultId } })
      : null;
    const superseding = labResult
      ? await tx.labResult.findUnique({
          where: { correctionOfId: labResult.id },
          select: { id: true },
        })
      : null;
    return {
      ...record,
      acceptedAt: record.acceptedAt?.toISOString() ?? null,
      startedAt: record.startedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
      closedAt: record.closedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      originStaffName:
        (await this.name(tx, record.originStaffId)) ?? 'Unknown staff',
      acceptedByName: await this.name(tx, record.acceptedById),
      startedByName: await this.name(tx, record.startedById),
      completedByName: await this.name(tx, record.completedById),
      closedByName: await this.name(tx, record.closedById),
      patient: {
        id: patient.id,
        revision: patient.revision,
        fullName: patient.fullName,
        sex: patient.sex,
        dateOfBirth: patient.dateOfBirth,
      },
      labOrder: labOrder
        ? {
            id: labOrder.id,
            requestedTests: labOrder.requestedTests,
            status: labOrder.status,
          }
        : null,
      labResult: labResult
        ? {
            id: labResult.id,
            orderId: labResult.orderId,
            finalizedAt: labResult.finalizedAt?.toISOString() ?? null,
            correctionOfId: labResult.correctionOfId,
            supersededById: superseding?.id ?? null,
          }
        : null,
    };
  }
  async listPatient(
    staff: Principal,
    patientId: string,
  ): Promise<ReferralDto[]> {
    access(staff);
    if (
      !(await this.db.patient.findUnique({
        where: { id: uuid(patientId, 'patientId') },
        select: { id: true },
      }))
    )
      fail(404, 'NOT_FOUND', 'Patient not found.');
    const records = await this.db.referral.findMany({
      where: {
        patientId,
        ...(!staff.isHead
          ? {
              OR: [
                { originStaffId: staff.id },
                { receivingDiscipline: unit(staff) },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return Promise.all(records.map((record) => this.dto(this.db, record)));
  }
  async inbox(staff: Principal, scope: unknown): Promise<ReferralDto[]> {
    access(staff);
    const records = await this.db.referral.findMany({
      where: { receivingDiscipline: unit(staff), ...scopeWhere(scope) },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return Promise.all(records.map((record) => this.dto(this.db, record)));
  }
  async sent(staff: Principal, scope: unknown): Promise<ReferralDto[]> {
    access(staff);
    if (staff.role === 'medtech') deny();
    const records = await this.db.referral.findMany({
      where: { originStaffId: staff.id, ...scopeWhere(scope) },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return Promise.all(records.map((record) => this.dto(this.db, record)));
  }
  async create(
    staff: Principal,
    patientId: string,
    input: unknown,
  ): Promise<ReferralDto> {
    access(staff);
    if (staff.role !== 'doctor' && staff.role !== 'dentist') deny();
    const body = object(input, ['receivingDiscipline', 'reason', 'labOrderId']);
    const receivingDiscipline = body.receivingDiscipline;
    if (
      !['medical', 'dental', 'laboratory'].includes(
        receivingDiscipline as string,
      ) ||
      receivingDiscipline === unit(staff)
    )
      invalid('receivingDiscipline');
    const reason = text(body.reason, 'reason', true, 4000)!;
    const labOrderId =
      body.labOrderId === null || body.labOrderId === undefined
        ? null
        : uuid(body.labOrderId, 'labOrderId');
    if ((receivingDiscipline === 'laboratory') !== (labOrderId !== null))
      invalid('labOrderId');
    return this.db.$transaction(async (tx) => {
      if (
        !(await tx.patient.findUnique({
          where: { id: uuid(patientId, 'patientId') },
          select: { id: true },
        }))
      )
        fail(404, 'NOT_FOUND', 'Patient not found.');
      if (labOrderId) {
        await tx.$queryRaw`SELECT id FROM "LabOrder" WHERE id = ${labOrderId}::uuid FOR UPDATE`;
        const labOrder = await tx.labOrder.findUnique({
          where: { id: labOrderId },
        });
        if (
          !labOrder ||
          labOrder.patientId !== patientId ||
          labOrder.orderingProviderId !== staff.id ||
          !['ordered', 'in_progress'].includes(labOrder.status)
        )
          invalid('labOrderId');
      }
      const record = await tx.referral.create({
        data: {
          patientId,
          originStaffId: staff.id,
          originDiscipline: unit(staff),
          receivingDiscipline: receivingDiscipline as string,
          reason,
          labOrderId,
          status: 'pending',
        },
      });
      await recordAudit(tx, staff, {
        action: 'create',
        resourceType: 'referral',
        resourceId: record.id,
        patientId: record.patientId,
      });
      return this.dto(tx, record);
    });
  }
  async transition(
    staff: Principal,
    id: string,
    input: unknown,
    action: Action,
  ): Promise<ReferralDto> {
    access(staff);
    const body = object(input, [
      'expectedRevision',
      ...(action === 'cancel' || action === 'reject' ? ['reason'] : []),
      ...(action === 'complete'
        ? ['completionNote', 'completionReference', 'labResultId']
        : []),
    ]);
    const wanted = revision(body.expectedRevision);
    const reason =
      action === 'cancel' || action === 'reject'
        ? text(body.reason, 'reason', true, 4000)!
        : null;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Referral" WHERE id = ${uuid(id)}::uuid FOR UPDATE`;
      const previous = await this.find(tx, staff, id);
      expected(previous, wanted);
      if (action === 'cancel') {
        if (previous.originStaffId !== staff.id) deny();
      } else {
        if (previous.receivingDiscipline !== unit(staff)) deny();
        if (previous.acceptedById && previous.acceptedById !== staff.id) deny();
      }
      state(
        previous,
        action === 'accept'
          ? ['pending']
          : action === 'start'
            ? ['accepted']
            : action === 'complete'
              ? ['in_progress']
              : ['pending', 'accepted', 'in_progress'],
      );
      const now = new Date();
      let data: Prisma.ReferralUncheckedUpdateInput;
      if (action === 'accept')
        data = { status: 'accepted', acceptedAt: now, acceptedById: staff.id };
      else if (action === 'start')
        data = { status: 'in_progress', startedAt: now, startedById: staff.id };
      else if (action === 'cancel' || action === 'reject')
        data = {
          status: action === 'cancel' ? 'cancelled' : 'rejected',
          closedAt: now,
          closedById: staff.id,
          closeReason: reason,
        };
      else {
        const completionNote =
          body.completionNote === undefined
            ? null
            : text(body.completionNote, 'completionNote', false, 4000);
        const completionReference =
          body.completionReference === undefined
            ? null
            : text(body.completionReference, 'completionReference', false, 200);
        const labResultId =
          body.labResultId === null || body.labResultId === undefined
            ? null
            : uuid(body.labResultId, 'labResultId');
        if (previous.receivingDiscipline === 'laboratory') {
          if (
            !labResultId ||
            !previous.labOrderId ||
            completionReference !== null
          )
            invalid('labResultId');
          await tx.$queryRaw`SELECT id FROM "LabOrder" WHERE id = ${previous.labOrderId}::uuid FOR UPDATE`;
          const order = await tx.labOrder.findUnique({
            where: { id: previous.labOrderId },
          });
          const result = await tx.labResult.findUnique({
            where: { id: labResultId },
          });
          if (
            !order ||
            order.patientId !== previous.patientId ||
            !['resulted', 'reviewed'].includes(order.status) ||
            !result ||
            result.orderId !== previous.labOrderId ||
            result.status !== 'finalized' ||
            (await tx.labResult.findUnique({
              where: { correctionOfId: result.id },
            }))
          )
            invalid('labResultId');
        } else if (labResultId !== null || !completionNote)
          invalid(labResultId !== null ? 'labResultId' : 'completionNote');
        data = {
          status: 'completed',
          completedAt: now,
          completedById: staff.id,
          completionNote,
          completionReference,
          labResultId,
        };
      }
      const record = await tx.referral.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
      });
      await recordAudit(tx, staff, {
        action: 'change',
        resourceType: 'referral',
        resourceId: record.id,
        patientId: record.patientId,
      });
      return this.dto(tx, record);
    });
  }
}
