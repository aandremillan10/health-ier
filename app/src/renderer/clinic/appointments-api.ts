import type {
  Appointment,
  AppointmentRequests,
  AppointmentResponses,
  AppointmentStatus,
  AppointmentWireApi,
} from '../../shared/appointments-api';
import type { Principal, Result } from './contract';

export type AppointmentApi = {
  [K in keyof AppointmentRequests]: (
    input: AppointmentRequests[K],
  ) => Promise<Result<AppointmentResponses[K]>>;
};
export const appointmentStatusNames: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  arrived: 'Arrived',
  waiting: 'Waiting',
  with_provider: 'With doctor or dentist',
  lab: 'Lab',
  completed: 'Completed',
  no_show: 'No-show',
};
export const appointmentStatuses = Object.keys(
  appointmentStatusNames,
) as AppointmentStatus[];
const next: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['arrived', 'no_show'],
  arrived: ['waiting'],
  waiting: ['with_provider', 'lab'],
  with_provider: ['lab', 'completed'],
  lab: ['with_provider', 'completed'],
  completed: [],
  no_show: [],
};
export function canScheduleAppointments(staff: Principal): boolean {
  return staff.role === 'clerk' || staff.role === 'attendant';
}
export function canChangeAppointment(
  staff: Principal,
  record: Appointment,
  target: AppointmentStatus,
  correction = false,
): boolean {
  const own =
    (staff.role === 'doctor' && record.discipline === 'medical') ||
    (staff.role === 'dentist' && record.discipline === 'dental') ||
    (staff.role === 'medtech' && record.discipline === 'laboratory');
  const intakeStates: AppointmentStatus[] = [
    'scheduled',
    'arrived',
    'waiting',
    'no_show',
  ];
  const allowed =
    own ||
    (canScheduleAppointments(staff) &&
      (correction
        ? intakeStates.includes(record.status) && intakeStates.includes(target)
        : ['arrived', 'waiting', 'no_show'].includes(target))) ||
    (!correction &&
      staff.role === 'medtech' &&
      record.status === 'lab' &&
      target === 'with_provider');
  return (
    allowed &&
    target !== record.status &&
    (target !== 'no_show' || Date.parse(record.scheduledAt) <= Date.now()) &&
    (correction ||
      (next[record.status].includes(target) &&
        !(record.discipline === 'laboratory' && target === 'with_provider') &&
        !(
          record.discipline !== 'laboratory' &&
          record.status === 'waiting' &&
          target === 'lab'
        )))
  );
}
export function createAppointmentDesktopClient(
  wire: AppointmentWireApi,
): AppointmentApi {
  async function result<K extends keyof AppointmentRequests>(
    name: K,
    input: AppointmentRequests[K],
  ): Promise<Result<AppointmentResponses[K]>> {
    const response = await wire[name](input);
    if (response.ok) return response;
    const error = response.error;
    return {
      ok: false,
      error: {
        code:
          error.code === 'FORBIDDEN'
            ? 'DENIED'
            : error.code === 'SESSION_CHANGED'
              ? 'UNAUTHENTICATED'
              : error.code === 'INVALID_RESPONSE'
                ? 'UNAVAILABLE'
                : [
                      'VALIDATION',
                      'UNAUTHENTICATED',
                      'NOT_FOUND',
                      'CONFLICT',
                    ].includes(error.code)
                  ? (error.code as
                      | 'VALIDATION'
                      | 'UNAUTHENTICATED'
                      | 'NOT_FOUND'
                      | 'CONFLICT')
                  : 'UNAVAILABLE',
        message: error.message,
        fieldErrors: error.fieldErrors,
        latestRevision: error.currentRevision,
      },
    };
  }
  return {
    listAppointments: (input) => result('listAppointments', input),
    createAppointment: (input) => result('createAppointment', input),
    transitionAppointment: (input) => result('transitionAppointment', input),
    correctAppointment: (input) => result('correctAppointment', input),
  };
}
