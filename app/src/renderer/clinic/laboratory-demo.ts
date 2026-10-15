import type {
  LabOrder,
  LabResult,
  LabValue,
} from '../../shared/laboratory-api';
import type { PatientIdentity } from '../../shared/clinic-api';
import type { ClinicError, Principal, Result } from './contract';
import type { LaboratoryApi } from './laboratory-contract';

class DemoLabError extends Error {
  constructor(readonly detail: ClinicError) {
    super(detail.message);
  }
}
function failure(
  code: ClinicError['code'],
  message: string,
  field?: string,
): never {
  throw new DemoLabError({
    code,
    message,
    ...(field ? { fieldErrors: { [field]: message } } : {}),
  });
}
function required(value: string, field: string, max = 4000): string {
  if (!value.trim() || value.length > max)
    failure('VALIDATION', 'Enter a valid value.', field);
  return value.trim();
}
function parseValues(input: LabValue[]): LabValue[] {
  if (input.length < 1 || input.length > 100)
    failure('VALIDATION', 'Enter between 1 and 100 test values.', 'values');
  const rows = input.map((row) => ({
    test: required(row.test, 'values', 200),
    value: required(row.value, 'values', 1000),
    unit:
      row.unit === null || row.unit.trim() === ''
        ? null
        : required(row.unit, 'values', 100),
    referenceRange:
      row.referenceRange === null || row.referenceRange.trim() === ''
        ? null
        : required(row.referenceRange, 'values', 200),
    flag: row.flag,
  }));
  if (new Set(rows.map((row) => row.test.toLowerCase())).size !== rows.length)
    failure(
      'VALIDATION',
      'Use a different name for each test value.',
      'values',
    );
  if (
    rows.some(
      (row) =>
        !['normal', 'abnormal', 'critical', 'unspecified'].includes(row.flag),
    )
  )
    failure('VALIDATION', 'Select a valid result flag.', 'values');
  return rows;
}

// Synthetic in-memory adapter. It shares the demo session and never replaces the server's authorization.
export function createLaboratoryDemo(options: {
  getStaff: () => Principal | null;
  getPatient: (id: string) => PatientIdentity | undefined;
  check?: () => Result<never> | null;
  revisionError?: (
    record: { revision: number },
    wanted: number,
  ) => Result<never> | null;
}): { api: LaboratoryApi; snapshot: () => LabOrder[] } {
  const orders: LabOrder[] = [];
  function readable(staff: Principal, order: LabOrder): boolean {
    return (
      staff.isHead ||
      staff.role === 'medtech' ||
      (staff.role === 'doctor' && order.discipline === 'medical') ||
      (staff.role === 'dentist' && order.discipline === 'dental')
    );
  }
  function view(staff: Principal, order: LabOrder): LabOrder {
    return {
      ...order,
      results: order.results.filter(
        (result) => staff.role === 'medtech' || result.status === 'finalized',
      ),
    };
  }
  function order(staff: Principal, id: string): LabOrder {
    const record = orders.find((value) => value.id === id);
    if (!record || !readable(staff, record))
      failure('NOT_FOUND', 'Laboratory order unavailable. Refresh orders.');
    return record;
  }
  function expected(record: { revision: number }, wanted: number): void {
    const error = options.revisionError?.(record, wanted);
    if (error && !error.ok) throw new DemoLabError(error.error);
    if (record.revision !== wanted)
      throw new DemoLabError({
        code: 'CONFLICT',
        message:
          'This laboratory record changed. Refresh orders and compare your input.',
        latestRevision: record.revision,
      });
  }
  function allowed(record: LabOrder, statuses: string[]): void {
    if (!statuses.includes(record.status))
      failure(
        'CONFLICT',
        'This action is no longer available. Refresh orders.',
      );
  }
  function medtech(staff: Principal): void {
    if (staff.role !== 'medtech')
      failure('DENIED', 'Only laboratory staff can perform this action.');
  }
  function touch(record: LabOrder): void {
    record.revision++;
    record.updatedAt = new Date().toISOString();
  }
  async function run<T>(
    operation: (staff: Principal) => T,
  ): Promise<Result<T>> {
    const denied = options.check?.();
    if (denied && !denied.ok) return denied;
    const staff = options.getStaff();
    if (!staff)
      return {
        ok: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Sign in again to continue.',
        },
      };
    if (!['doctor', 'dentist', 'medtech'].includes(staff.role))
      return {
        ok: false,
        error: {
          code: 'DENIED',
          message: 'Your account cannot access laboratory work.',
        },
      };
    try {
      return { ok: true, data: structuredClone(operation(staff)) };
    } catch (error) {
      if (error instanceof DemoLabError)
        return { ok: false, error: error.detail };
      return {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: 'Check the laboratory fields and try again.',
        },
      };
    }
  }
  function close(
    staff: Principal,
    input: { id: string; expectedRevision: number; reason: string },
    reject: boolean,
  ): LabOrder {
    if (reject) medtech(staff);
    const record = order(staff, input.id);
    expected(record, input.expectedRevision);
    if (
      !reject &&
      (record.orderingProviderId !== staff.id ||
        !['doctor', 'dentist'].includes(staff.role))
    )
      failure('DENIED', 'Only the ordering provider can cancel this order.');
    allowed(record, ['ordered', 'in_progress']);
    const reason = required(input.reason, 'reason');
    record.status = reject ? 'rejected' : 'cancelled';
    record.closeReason = reason;
    record.closedAt = new Date().toISOString();
    touch(record);
    return view(staff, record);
  }
  function result(
    staff: Principal,
    id: string,
  ): { order: LabOrder; result: LabResult } {
    medtech(staff);
    const record = orders.find((value) =>
      value.results.some((entry) => entry.id === id),
    );
    const entry = record?.results.find((value) => value.id === id);
    if (!record || !entry)
      failure('NOT_FOUND', 'Laboratory result unavailable. Refresh orders.');
    if (entry.authorId !== staff.id)
      failure('DENIED', 'Only the author can change or finalize this result.');
    return { order: record, result: entry };
  }
  const api: LaboratoryApi = {
    async listLabOrders({ patientId }) {
      return run((staff) => {
        if (!options.getPatient(patientId))
          failure('NOT_FOUND', 'Patient unavailable. Open another patient.');
        return orders
          .filter(
            (record) =>
              record.patientId === patientId && readable(staff, record),
          )
          .map((record) => view(staff, record));
      });
    },
    async listLabQueue({ scope }) {
      return run((staff) => {
        medtech(staff);
        return orders
          .filter(
            (record) =>
              scope === 'all' ||
              ['ordered', 'in_progress'].includes(record.status),
          )
          .map((record) => view(staff, record));
      });
    },
    async createLabOrder(input) {
      return run((staff) => {
        if (!['doctor', 'dentist'].includes(staff.role))
          failure('DENIED', 'Only providers can create laboratory orders.');
        const patient = options.getPatient(input.patientId);
        if (!patient)
          failure('NOT_FOUND', 'Patient unavailable. Open another patient.');
        const requestedTests = input.requestedTests.map((test) =>
          required(test, 'requestedTests', 200),
        );
        if (
          requestedTests.length < 1 ||
          requestedTests.length > 50 ||
          new Set(requestedTests.map((test) => test.toLowerCase())).size !==
            requestedTests.length
        )
          failure(
            'VALIDATION',
            'Enter 1 to 50 different requested tests.',
            'requestedTests',
          );
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(input.requestedFor) ||
          !Number.isFinite(Date.parse(input.requestedFor)) ||
          new Date(input.requestedFor).toISOString().slice(0, 10) !==
            input.requestedFor
        )
          failure(
            'VALIDATION',
            'Select a valid requested date.',
            'requestedFor',
          );
        if (!['routine', 'urgent'].includes(input.priority))
          failure('VALIDATION', 'Select a valid priority.', 'priority');
        if ((input.clinicalContext?.length ?? 0) > 4000)
          failure(
            'VALIDATION',
            'Use up to 4000 characters.',
            'clinicalContext',
          );
        const now = new Date().toISOString();
        const created: LabOrder = {
          id: crypto.randomUUID(),
          patientId: patient.id,
          patient: {
            id: patient.id,
            fullName: patient.fullName,
            revision: patient.revision,
            sex: patient.sex,
            dateOfBirth: patient.dateOfBirth,
          },
          orderingProviderId: staff.id,
          orderingProviderName: staff.displayName,
          discipline: staff.role === 'doctor' ? 'medical' : 'dental',
          requestedTests,
          clinicalContext: input.clinicalContext?.trim() || null,
          priority: input.priority,
          requestedFor: input.requestedFor,
          status: 'ordered',
          revision: 1,
          startedAt: null,
          finalizedAt: null,
          reviewedAt: null,
          reviewedById: null,
          closedAt: null,
          closeReason: null,
          createdAt: now,
          updatedAt: now,
          results: [],
        };
        orders.unshift(created);
        return view(staff, created);
      });
    },
    async startLabOrder(input) {
      return run((staff) => {
        medtech(staff);
        const record = order(staff, input.id);
        expected(record, input.expectedRevision);
        allowed(record, ['ordered']);
        record.status = 'in_progress';
        record.startedAt = new Date().toISOString();
        touch(record);
        return view(staff, record);
      });
    },
    async cancelLabOrder(input) {
      return run((staff) => close(staff, input, false));
    },
    async rejectLabOrder(input) {
      return run((staff) => close(staff, input, true));
    },
    async saveLabResult(input) {
      return run((staff) => {
        medtech(staff);
        const record = order(staff, input.orderId);
        expected(record, input.expectedRevision);
        allowed(record, ['in_progress']);
        const draft = record.results.find((entry) => entry.status === 'draft');
        if (draft && draft.authorId !== staff.id)
          failure('DENIED', 'Only the author can edit this draft.');
        if (record.results.some((entry) => entry.status === 'finalized'))
          failure(
            'CONFLICT',
            'Finalized values need an attributed correction.',
          );
        const parsed = parseValues(input.values);
        if ((input.notes?.length ?? 0) > 4000)
          failure('VALIDATION', 'Use up to 4000 characters.', 'notes');
        const notes = input.notes?.trim() || null;
        const now = new Date().toISOString();
        if (draft) {
          draft.values = parsed;
          draft.notes = notes;
          draft.revision++;
          draft.updatedAt = now;
        } else
          record.results.push({
            id: crypto.randomUUID(),
            orderId: record.id,
            authorId: staff.id,
            authorName: staff.displayName,
            status: 'draft',
            revision: 1,
            values: parsed,
            notes,
            correctionOfId: null,
            correctionReason: null,
            sourceRevision: null,
            finalizedAt: null,
            createdAt: now,
            updatedAt: now,
          });
        touch(record);
        return view(staff, record);
      });
    },
    async finalizeLabResult(input) {
      return run((staff) => {
        const selected = result(staff, input.id);
        expected(selected.order, input.expectedOrderRevision);
        expected(selected.result, input.expectedRevision);
        allowed(selected.order, ['in_progress']);
        if (selected.result.status !== 'draft')
          failure(
            'CONFLICT',
            'Finalized values need an attributed correction.',
          );
        const now = new Date().toISOString();
        selected.result.status = 'finalized';
        selected.result.finalizedAt = now;
        selected.result.updatedAt = now;
        selected.result.revision++;
        selected.order.status = 'resulted';
        selected.order.finalizedAt = now;
        touch(selected.order);
        return view(staff, selected.order);
      });
    },
    async correctLabResult(input) {
      return run((staff) => {
        const selected = result(staff, input.id);
        expected(selected.order, input.expectedOrderRevision);
        expected(selected.result, input.expectedRevision);
        allowed(selected.order, ['resulted', 'reviewed']);
        if (
          selected.result.status !== 'finalized' ||
          selected.order.results.some(
            (entry) => entry.correctionOfId === input.id,
          )
        )
          failure('CONFLICT', 'Correct the latest finalized result.');
        const values = parseValues(input.values);
        const reason = required(input.reason, 'reason');
        if ((input.notes?.length ?? 0) > 4000)
          failure('VALIDATION', 'Use up to 4000 characters.', 'notes');
        const now = new Date().toISOString();
        selected.order.results.push({
          id: crypto.randomUUID(),
          orderId: selected.order.id,
          authorId: staff.id,
          authorName: staff.displayName,
          status: 'finalized',
          revision: 1,
          values,
          notes: input.notes?.trim() || null,
          correctionOfId: input.id,
          correctionReason: reason,
          sourceRevision: input.expectedRevision,
          finalizedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        selected.order.status = 'resulted';
        selected.order.reviewedAt = null;
        selected.order.reviewedById = null;
        touch(selected.order);
        return view(staff, selected.order);
      });
    },
    async reviewLabOrder(input) {
      return run((staff) => {
        const record = order(staff, input.id);
        expected(record, input.expectedRevision);
        if (
          record.orderingProviderId !== staff.id ||
          !['doctor', 'dentist'].includes(staff.role)
        )
          failure(
            'DENIED',
            'Only the ordering provider can review this result.',
          );
        allowed(record, ['resulted']);
        record.status = 'reviewed';
        record.reviewedAt = new Date().toISOString();
        record.reviewedById = staff.id;
        touch(record);
        return view(staff, record);
      });
    },
  };
  return { api, snapshot: () => structuredClone(orders) };
}
