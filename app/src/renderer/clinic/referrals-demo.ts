import type { PatientIdentity } from '../../shared/clinic-api';
import type { LabOrder } from '../../shared/laboratory-api';
import type {
  Referral,
  ReferralCompletion,
  ReferralUnit,
} from '../../shared/referrals-api';
import type { ClinicError, Principal, Result } from './contract';
import type { ReferralsApi } from './referrals-contract';

type StoredReferral = Omit<Referral, 'labOrder' | 'labResult'>;
class DemoReferralError extends Error {
  constructor(readonly detail: ClinicError) {
    super(detail.message);
  }
}
function failure(
  code: ClinicError['code'],
  message: string,
  field?: string,
): never {
  throw new DemoReferralError({
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
function unit(staff: Principal): ReferralUnit {
  if (staff.role === 'doctor') return 'medical';
  if (staff.role === 'dentist') return 'dental';
  if (staff.role === 'medtech') return 'laboratory';
  return failure('DENIED', 'Your account cannot access referrals.');
}

// Synthetic in-memory adapter. Laboratory references come from the same demo laboratory instance.
export function createReferralsDemo(options: {
  getStaff: () => Principal | null;
  getPatient: (id: string) => PatientIdentity | undefined;
  getLabOrders: () => LabOrder[];
  check?: () => Result<never> | null;
  revisionError?: (
    record: { revision: number },
    wanted: number,
  ) => Result<never> | null;
}): { api: ReferralsApi; snapshot: () => Referral[] } {
  const records: StoredReferral[] = [];
  function readable(staff: Principal, record: StoredReferral): boolean {
    return (
      staff.isHead ||
      record.originStaffId === staff.id ||
      record.receivingDiscipline === unit(staff)
    );
  }
  function find(staff: Principal, id: string): StoredReferral {
    const record = records.find((entry) => entry.id === id);
    if (!record || !readable(staff, record))
      failure('NOT_FOUND', 'Referral unavailable. Refresh referrals.');
    return record;
  }
  function dto(record: StoredReferral): Referral {
    const labOrder = record.labOrderId
      ? options.getLabOrders().find((order) => order.id === record.labOrderId)
      : undefined;
    const labResult = labOrder?.results.find(
      (result) => result.id === record.labResultId,
    );
    return {
      ...record,
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
            finalizedAt: labResult.finalizedAt,
            correctionOfId: labResult.correctionOfId,
            supersededById:
              labOrder?.results.find(
                (result) => result.correctionOfId === labResult.id,
              )?.id ?? null,
          }
        : null,
    };
  }
  function expected(record: StoredReferral, wanted: number): void {
    const error = options.revisionError?.(record, wanted);
    if (error && !error.ok) throw new DemoReferralError(error.error);
    if (record.revision !== wanted)
      throw new DemoReferralError({
        code: 'CONFLICT',
        message:
          'This referral changed. Refresh referrals and compare your input.',
        latestRevision: record.revision,
      });
  }
  function allowed(record: StoredReferral, states: string[]): void {
    if (!states.includes(record.status))
      failure(
        'CONFLICT',
        'This action is no longer available. Refresh referrals.',
      );
  }
  function receiver(staff: Principal, record: StoredReferral): void {
    if (
      record.receivingDiscipline !== unit(staff) ||
      (record.acceptedById && record.acceptedById !== staff.id)
    )
      failure(
        'DENIED',
        'Only the receiving staff member assigned to this task can change it.',
      );
  }
  function touch(record: StoredReferral): void {
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
    try {
      unit(staff);
      return { ok: true, data: structuredClone(operation(staff)) };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof DemoReferralError
            ? error.detail
            : {
                code: 'VALIDATION',
                message: 'Check the referral fields and try again.',
              },
      };
    }
  }
  function complete(
    staff: Principal,
    record: StoredReferral,
    input: ReferralCompletion,
  ): void {
    const completionNote = input.completionNote?.trim() || null;
    const completionReference = input.completionReference?.trim() || null;
    if ((input.completionNote?.length ?? 0) > 4000)
      failure('VALIDATION', 'Use up to 4000 characters.', 'completionNote');
    if ((input.completionReference?.length ?? 0) > 200)
      failure('VALIDATION', 'Use up to 200 characters.', 'completionReference');
    if (record.receivingDiscipline === 'laboratory') {
      const order = options
        .getLabOrders()
        .find((entry) => entry.id === record.labOrderId);
      const result = order?.results.find(
        (entry) => entry.id === input.labResultId,
      );
      if (
        !order ||
        order.patientId !== record.patientId ||
        !['resulted', 'reviewed'].includes(order.status) ||
        !result ||
        result.status !== 'finalized' ||
        order.results.some((entry) => entry.correctionOfId === result.id) ||
        completionReference
      )
        failure(
          'VALIDATION',
          'Select the current finalized result for the linked laboratory order.',
          'labResultId',
        );
    } else if (input.labResultId || !completionNote)
      failure(
        'VALIDATION',
        'Enter a completion note for this referral.',
        'completionNote',
      );
    record.status = 'completed';
    record.completedAt = new Date().toISOString();
    record.completedById = staff.id;
    record.completedByName = staff.displayName;
    record.completionNote = completionNote;
    record.completionReference = completionReference;
    record.labResultId = input.labResultId;
    touch(record);
  }
  function close(
    staff: Principal,
    id: string,
    wanted: number,
    inputReason: string,
    reject: boolean,
  ): Referral {
    const record = find(staff, id);
    expected(record, wanted);
    if (reject) receiver(staff, record);
    else if (record.originStaffId !== staff.id)
      failure(
        'DENIED',
        'Only the originating provider can cancel this referral.',
      );
    allowed(record, ['pending', 'accepted', 'in_progress']);
    const reason = required(inputReason, 'reason');
    record.status = reject ? 'rejected' : 'cancelled';
    record.closedAt = new Date().toISOString();
    record.closedById = staff.id;
    record.closedByName = staff.displayName;
    record.closeReason = reason;
    touch(record);
    return dto(record);
  }
  const api: ReferralsApi = {
    async listReferrals({ patientId }) {
      return run((staff) => {
        if (!options.getPatient(patientId))
          failure('NOT_FOUND', 'Patient unavailable. Open another patient.');
        return records
          .filter(
            (record) =>
              record.patientId === patientId && readable(staff, record),
          )
          .map(dto);
      });
    },
    async listReferralInbox({ scope }) {
      return run((staff) =>
        records
          .filter(
            (record) =>
              record.receivingDiscipline === unit(staff) &&
              (scope === 'all' ||
                ['pending', 'accepted', 'in_progress'].includes(record.status)),
          )
          .map(dto),
      );
    },
    async listSentReferrals({ scope }) {
      return run((staff) => {
        if (staff.role === 'medtech')
          failure('DENIED', 'Only providers send referrals.');
        return records
          .filter(
            (record) =>
              record.originStaffId === staff.id &&
              (scope === 'all' ||
                ['pending', 'accepted', 'in_progress'].includes(record.status)),
          )
          .map(dto);
      });
    },
    async createReferral(input) {
      return run((staff) => {
        if (!['doctor', 'dentist'].includes(staff.role))
          failure('DENIED', 'Only providers can send referrals.');
        const patient = options.getPatient(input.patientId);
        if (!patient)
          failure('NOT_FOUND', 'Patient unavailable. Open another patient.');
        if (
          !['medical', 'dental', 'laboratory'].includes(
            input.receivingDiscipline,
          ) ||
          input.receivingDiscipline === unit(staff)
        )
          failure(
            'VALIDATION',
            'Select another receiving unit.',
            'receivingDiscipline',
          );
        const reason = required(input.reason, 'reason');
        if (input.receivingDiscipline === 'laboratory') {
          const labOrder = options
            .getLabOrders()
            .find((order) => order.id === input.labOrderId);
          if (
            !labOrder ||
            labOrder.patientId !== input.patientId ||
            labOrder.orderingProviderId !== staff.id ||
            !['ordered', 'in_progress'].includes(labOrder.status)
          )
            failure(
              'VALIDATION',
              'Select your active laboratory order for this patient.',
              'labOrderId',
            );
        } else if (input.labOrderId)
          failure(
            'VALIDATION',
            'Only laboratory referrals can link a laboratory order.',
            'labOrderId',
          );
        const now = new Date().toISOString();
        const record: StoredReferral = {
          id: crypto.randomUUID(),
          patientId: patient.id,
          patient: {
            id: patient.id,
            revision: patient.revision,
            fullName: patient.fullName,
            sex: patient.sex,
            dateOfBirth: patient.dateOfBirth,
          },
          originStaffId: staff.id,
          originStaffName: staff.displayName,
          originDiscipline: staff.role === 'doctor' ? 'medical' : 'dental',
          receivingDiscipline: input.receivingDiscipline,
          reason,
          status: 'pending',
          revision: 1,
          acceptedAt: null,
          acceptedById: null,
          acceptedByName: null,
          startedAt: null,
          startedById: null,
          startedByName: null,
          completedAt: null,
          completedById: null,
          completedByName: null,
          completionNote: null,
          completionReference: null,
          closedAt: null,
          closedById: null,
          closedByName: null,
          closeReason: null,
          labOrderId: input.labOrderId,
          labResultId: null,
          createdAt: now,
          updatedAt: now,
        };
        records.unshift(record);
        return dto(record);
      });
    },
    async acceptReferral(input) {
      return run((staff) => {
        const record = find(staff, input.id);
        expected(record, input.expectedRevision);
        receiver(staff, record);
        allowed(record, ['pending']);
        record.status = 'accepted';
        record.acceptedAt = new Date().toISOString();
        record.acceptedById = staff.id;
        record.acceptedByName = staff.displayName;
        touch(record);
        return dto(record);
      });
    },
    async startReferral(input) {
      return run((staff) => {
        const record = find(staff, input.id);
        expected(record, input.expectedRevision);
        receiver(staff, record);
        allowed(record, ['accepted']);
        record.status = 'in_progress';
        record.startedAt = new Date().toISOString();
        record.startedById = staff.id;
        record.startedByName = staff.displayName;
        touch(record);
        return dto(record);
      });
    },
    async completeReferral(input) {
      return run((staff) => {
        const record = find(staff, input.id);
        expected(record, input.expectedRevision);
        receiver(staff, record);
        allowed(record, ['in_progress']);
        complete(staff, record, input);
        return dto(record);
      });
    },
    async cancelReferral(input) {
      return run((staff) =>
        close(staff, input.id, input.expectedRevision, input.reason, false),
      );
    },
    async rejectReferral(input) {
      return run((staff) =>
        close(staff, input.id, input.expectedRevision, input.reason, true),
      );
    },
  };
  return { api, snapshot: () => structuredClone(records.map(dto)) };
}
