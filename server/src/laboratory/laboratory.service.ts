import { Injectable } from '@nestjs/common';
import { recordAudit } from '../audit/audit.service';
import { DatabaseService } from '../database/database.service';
import { fail } from '../errors';
import { serverMode } from '../config';
import type { LabOrder, LabResult, Prisma } from '../generated/prisma/client';
import type { Principal } from '../mirror-contract';
import { dateOnly, invalid, object, revision, text, uuid } from '../validation';

interface LabValue {
  test: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  flag: 'normal' | 'abnormal' | 'critical' | 'unspecified';
}
type OrderDates =
  | 'startedAt'
  | 'finalizedAt'
  | 'reviewedAt'
  | 'closedAt'
  | 'createdAt'
  | 'updatedAt';
type LabResultDto = Omit<
  LabResult,
  'values' | 'createdAt' | 'updatedAt' | 'finalizedAt'
> & {
  authorName: string;
  values: LabValue[];
  createdAt: string;
  updatedAt: string;
  finalizedAt: string | null;
};
export type LabOrderDto = Omit<LabOrder, OrderDates> & {
  startedAt: string | null;
  finalizedAt: string | null;
  reviewedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  orderingProviderName: string;
  patient: {
    id: string;
    revision: number;
    fullName: string;
    sex: string | null;
    dateOfBirth: string | null;
  };
  results: LabResultDto[];
};
function deny(): never {
  return fail(
    403,
    'FORBIDDEN',
    'This laboratory action is not permitted for your account.',
  );
}
function access(staff: Principal): void {
  if (serverMode() !== 'EDGE')
    fail(403, 'EDGE_ONLY', 'Use the clinic server for laboratory work.');
  if (!['doctor', 'dentist', 'medtech'].includes(staff.role)) deny();
}
function medtech(staff: Principal): void {
  access(staff);
  if (staff.role !== 'medtech') deny();
}
function expected(record: { revision: number }, wanted: number): void {
  if (record.revision !== wanted)
    fail(
      409,
      'STALE_REVISION',
      'This laboratory record changed. Reload it before you retry.',
      { currentRevision: record.revision },
    );
}
function state(order: LabOrder, allowed: readonly string[]): void {
  if (!allowed.includes(order.status))
    fail(
      409,
      'LIFECYCLE_CONFLICT',
      'This action is no longer available. Reload the laboratory order.',
    );
}
function values(input: unknown): LabValue[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100)
    invalid('values');
  const parsed = input.map((value: unknown): LabValue => {
    const row = object(value, [
      'test',
      'value',
      'unit',
      'referenceRange',
      'flag',
    ]);
    const flag = row.flag;
    if (
      flag !== 'normal' &&
      flag !== 'abnormal' &&
      flag !== 'critical' &&
      flag !== 'unspecified'
    )
      invalid('values');
    return {
      test: text(row.test, 'values', true, 200)!,
      value: text(row.value, 'values', true, 1000)!,
      unit:
        row.unit === undefined ? null : text(row.unit, 'values', false, 100),
      referenceRange:
        row.referenceRange === undefined
          ? null
          : text(row.referenceRange, 'values', false, 200),
      flag,
    };
  });
  if (
    new Set(parsed.map((row) => row.test.toLocaleLowerCase())).size !==
    parsed.length
  )
    invalid('values');
  return parsed;
}
function tests(input: unknown): string[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 50)
    invalid('requestedTests');
  const parsed = input.map((value: unknown) =>
    text(value, 'requestedTests', true, 200)!,
  );
  if (
    new Set(parsed.map((value) => value.toLocaleLowerCase())).size !==
    parsed.length
  )
    invalid('requestedTests');
  return parsed;
}

@Injectable()
export class LaboratoryService {
  constructor(private readonly db: DatabaseService) {}

  private async order(
    tx: Prisma.TransactionClient,
    staff: Principal,
    id: string,
  ): Promise<LabOrder> {
    const order = await tx.labOrder.findUnique({ where: { id: uuid(id) } });
    if (
      !order ||
      !(
        staff.isHead ||
        staff.role === 'medtech' ||
        (staff.role === 'doctor' && order.discipline === 'medical') ||
        (staff.role === 'dentist' && order.discipline === 'dental')
      )
    )
      fail(404, 'NOT_FOUND', 'Laboratory order not found.');
    return order;
  }
  private async locked(
    tx: Prisma.TransactionClient,
    staff: Principal,
    id: string,
    wanted: number,
  ): Promise<LabOrder> {
    await tx.$queryRaw`SELECT id FROM "LabOrder" WHERE id = ${uuid(id)}::uuid FOR UPDATE`;
    const order = await this.order(tx, staff, id);
    expected(order, wanted);
    return order;
  }
  private async dto(
    tx: Prisma.TransactionClient,
    staff: Principal,
    order: LabOrder,
  ): Promise<LabOrderDto> {
    const patient = await tx.patient.findUnique({
      where: { id: order.patientId },
      select: {
        id: true,
        revision: true,
        fullName: true,
        sex: true,
        dateOfBirth: true,
      },
    });
    const provider = await tx.staff.findUnique({
      where: { id: order.orderingProviderId },
      select: { displayName: true },
    });
    if (!patient || !provider)
      fail(404, 'NOT_FOUND', 'Laboratory order context is unavailable.');
    const results = await tx.labResult.findMany({
      where: {
        orderId: order.id,
        ...(staff.role === 'medtech' ? {} : { status: 'finalized' }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return {
      ...order,
      startedAt: order.startedAt?.toISOString() ?? null,
      finalizedAt: order.finalizedAt?.toISOString() ?? null,
      reviewedAt: order.reviewedAt?.toISOString() ?? null,
      closedAt: order.closedAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      patient: {
        id: patient.id,
        revision: patient.revision,
        fullName: patient.fullName,
        sex: patient.sex,
        dateOfBirth: patient.dateOfBirth,
      },
      orderingProviderName: provider.displayName,
      results: await Promise.all(
        results.map(async (result) => {
          const author = await tx.staff.findUnique({
            where: { id: result.authorId },
            select: { displayName: true },
          });
          return {
            ...result,
            values: values(result.values),
            authorName: author?.displayName ?? 'Unknown staff',
            finalizedAt: result.finalizedAt?.toISOString() ?? null,
            createdAt: result.createdAt.toISOString(),
            updatedAt: result.updatedAt.toISOString(),
          };
        }),
      ),
    };
  }
  async listOrders(
    staff: Principal,
    patientId: string,
  ): Promise<LabOrderDto[]> {
    access(staff);
    if (
      !(await this.db.patient.findUnique({
        where: { id: uuid(patientId, 'patientId') },
        select: { id: true },
      }))
    )
      fail(404, 'NOT_FOUND', 'Patient not found.');
    const orders = await this.db.labOrder.findMany({
      where: {
        patientId,
        ...(!staff.isHead && staff.role !== 'medtech'
          ? { discipline: staff.role === 'doctor' ? 'medical' : 'dental' }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return Promise.all(orders.map((order) => this.dto(this.db, staff, order)));
  }
  async queue(staff: Principal, scope: unknown): Promise<LabOrderDto[]> {
    medtech(staff);
    if (scope !== undefined && scope !== 'pending' && scope !== 'all')
      invalid('scope');
    const orders = await this.db.labOrder.findMany({
      where:
        scope === 'all' ? {} : { status: { in: ['ordered', 'in_progress'] } },
      orderBy: [
        { priority: 'desc' },
        { requestedFor: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    return Promise.all(orders.map((order) => this.dto(this.db, staff, order)));
  }
  async createOrder(
    staff: Principal,
    patientId: string,
    input: unknown,
  ): Promise<LabOrderDto> {
    access(staff);
    if (staff.role !== 'doctor' && staff.role !== 'dentist') deny();
    const body = object(input, [
      'requestedTests',
      'clinicalContext',
      'priority',
      'requestedFor',
    ]);
    const requestedTests = tests(body.requestedTests);
    const clinicalContext =
      body.clinicalContext === undefined
        ? null
        : text(body.clinicalContext, 'clinicalContext', false, 4000);
    if (body.priority !== 'routine' && body.priority !== 'urgent')
      invalid('priority');
    const priority = body.priority;
    const requestedFor = dateOnly(body.requestedFor, 'requestedFor');
    return this.db.$transaction(async (tx) => {
      if (
        !(await tx.patient.findUnique({
          where: { id: uuid(patientId, 'patientId') },
          select: { id: true },
        }))
      )
        fail(404, 'NOT_FOUND', 'Patient not found.');
      const order = await tx.labOrder.create({
        data: {
          patientId,
          orderingProviderId: staff.id,
          discipline: staff.role === 'doctor' ? 'medical' : 'dental',
          requestedTests,
          clinicalContext,
          priority,
          requestedFor,
          status: 'ordered',
        },
      });
      await recordAudit(tx, staff, {
        action: 'create',
        resourceType: 'lab-order',
        resourceId: order.id,
        patientId: order.patientId,
      });
      return this.dto(tx, staff, order);
    });
  }
  async transition(
    staff: Principal,
    id: string,
    input: unknown,
    action: 'start' | 'cancel' | 'reject' | 'review',
  ): Promise<LabOrderDto> {
    access(staff);
    if (action === 'start' || action === 'reject') medtech(staff);
    const body = object(input, [
      'expectedRevision',
      ...(action === 'cancel' || action === 'reject' ? ['reason'] : []),
    ]);
    const wanted = revision(body.expectedRevision);
    const reason =
      action === 'cancel' || action === 'reject'
        ? text(body.reason, 'reason', true, 4000)!
        : null;
    return this.db.$transaction(async (tx) => {
      const previous = await this.locked(tx, staff, id, wanted);
      if (
        (action === 'cancel' || action === 'review') &&
        (previous.orderingProviderId !== staff.id ||
          !['doctor', 'dentist'].includes(staff.role))
      )
        deny();
      state(
        previous,
        action === 'review'
          ? ['resulted']
          : action === 'start'
            ? ['ordered']
            : ['ordered', 'in_progress'],
      );
      const now = new Date();
      const data: Prisma.LabOrderUncheckedUpdateInput =
        action === 'start'
          ? { status: 'in_progress', startedAt: now }
          : action === 'review'
            ? { status: 'reviewed', reviewedAt: now, reviewedById: staff.id }
            : {
                status: action === 'cancel' ? 'cancelled' : 'rejected',
                closedAt: now,
                closeReason: reason,
              };
      const order = await tx.labOrder.update({
        where: { id },
        data: { ...data, revision: { increment: 1 } },
      });
      await recordAudit(tx, staff, {
        action: 'change',
        resourceType: 'lab-order',
        resourceId: order.id,
        patientId: order.patientId,
      });
      return this.dto(tx, staff, order);
    });
  }
  async saveResult(
    staff: Principal,
    orderId: string,
    input: unknown,
  ): Promise<LabOrderDto> {
    medtech(staff);
    const body = object(input, ['expectedRevision', 'values', 'notes']);
    const wanted = revision(body.expectedRevision);
    const parsed = values(body.values);
    const notes =
      body.notes === undefined ? null : text(body.notes, 'notes', false, 4000);
    return this.db.$transaction(async (tx) => {
      const previous = await this.locked(tx, staff, orderId, wanted);
      state(previous, ['in_progress']);
      const results = await tx.labResult.findMany({ where: { orderId } });
      const draft = results.find((result) => result.status === 'draft');
      if (results.some((result) => result.status === 'finalized'))
        state(previous, []);
      if (draft && draft.authorId !== staff.id) deny();
      const data = {
        values: parsed as unknown as Prisma.InputJsonArray,
        notes,
      };
      const result = draft
        ? await tx.labResult.update({
            where: { id: draft.id },
            data: { ...data, revision: { increment: 1 } },
          })
        : await tx.labResult.create({
            data: { ...data, orderId, authorId: staff.id, status: 'draft' },
          });
      const order = await tx.labOrder.update({
        where: { id: orderId },
        data: { revision: { increment: 1 } },
      });
      await recordAudit(tx, staff, {
        action: draft ? 'change' : 'create',
        resourceType: 'lab-result',
        resourceId: result.id,
        patientId: order.patientId,
      });
      return this.dto(tx, staff, order);
    });
  }
  async finalizeResult(
    staff: Principal,
    id: string,
    input: unknown,
    correction = false,
  ): Promise<LabOrderDto> {
    medtech(staff);
    const body = object(input, [
      'expectedRevision',
      'expectedOrderRevision',
      ...(correction ? ['reason', 'values', 'notes'] : []),
    ]);
    const wanted = revision(body.expectedRevision);
    const orderRevision = revision(body.expectedOrderRevision);
    const correctedValues = correction ? values(body.values) : null;
    const reason = correction ? text(body.reason, 'reason', true, 4000)! : null;
    const notes =
      correction && body.notes !== undefined
        ? text(body.notes, 'notes', false, 4000)
        : null;
    return this.db.$transaction(async (tx) => {
      const candidate = await tx.labResult.findUnique({
        where: { id: uuid(id) },
      });
      if (!candidate) fail(404, 'NOT_FOUND', 'Laboratory result not found.');
      const previous = await this.locked(
        tx,
        staff,
        candidate.orderId,
        orderRevision,
      );
      const result = await tx.labResult.findUnique({ where: { id } });
      if (!result) fail(404, 'NOT_FOUND', 'Laboratory result not found.');
      if (result.authorId !== staff.id) deny();
      expected(result, wanted);
      state(previous, correction ? ['resulted', 'reviewed'] : ['in_progress']);
      if (result.status !== (correction ? 'finalized' : 'draft'))
        state(previous, []);
      const now = new Date();
      if (correction) {
        if (await tx.labResult.findUnique({ where: { correctionOfId: id } }))
          fail(
            409,
            'LIFECYCLE_CONFLICT',
            'A correction already follows this result. Open the latest correction.',
          );
        await tx.labResult.create({
          data: {
            orderId: previous.id,
            authorId: staff.id,
            status: 'finalized',
            values: correctedValues as unknown as Prisma.InputJsonArray,
            notes,
            correctionOfId: id,
            correctionReason: reason,
            sourceRevision: wanted,
            finalizedAt: now,
          },
        });
      } else {
        values(result.values);
        await tx.labResult.update({
          where: { id },
          data: {
            status: 'finalized',
            finalizedAt: now,
            revision: { increment: 1 },
          },
        });
      }
      const order = await tx.labOrder.update({
        where: { id: previous.id },
        data: {
          status: 'resulted',
          finalizedAt: previous.finalizedAt ?? now,
          reviewedAt: null,
          reviewedById: null,
          revision: { increment: 1 },
        },
      });
      await recordAudit(tx, staff, {
        action: correction ? 'correction' : 'finalize',
        resourceType: 'lab-result',
        resourceId: id,
        patientId: order.patientId,
      });
      return this.dto(tx, staff, order);
    });
  }
}
