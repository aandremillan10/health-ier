import type {
  Appointment,
  AppointmentRequests,
  AppointmentStatus,
} from '../../shared/appointments-api';
import type { Principal, Result } from './contract';
import {
  canChangeAppointment,
  canScheduleAppointments,
  type AppointmentApi,
} from './appointments-api';

// Explicit synthetic fixture only; production appointment writes go through the clinic server.
export function createDemoAppointments({
  getStaff,
  getPatient,
  isAvailable,
}: {
  getStaff: () => Principal | null;
  getPatient: (
    id: string,
  ) => { id: string; fullName: string; dateOfBirth: string | null } | null;
  isAvailable: () => boolean;
}): AppointmentApi & { snapshotAppointments: () => Appointment[] } {
  const records: Appointment[] = [];
  function failure<T>(
    code:
      | 'VALIDATION'
      | 'UNAUTHENTICATED'
      | 'DENIED'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'UNAVAILABLE',
    message: string,
  ): Result<T> {
    return { ok: false, error: { code, message } };
  }
  function ready(): Result<Principal> {
    if (!isAvailable())
      return failure(
        'UNAVAILABLE',
        'The clinic server is unavailable. Keep your input and try again when the connection returns.',
      );
    const staff = getStaff();
    return staff
      ? { ok: true, data: staff }
      : failure('UNAUTHENTICATED', 'Sign in to continue.');
  }
  function success<T>(data: T): Result<T> {
    return { ok: true, data: structuredClone(data) };
  }
  async function change(
    input: AppointmentRequests['transitionAppointment'] & { reason?: string },
    correction: boolean,
  ): Promise<Result<Appointment>> {
    const session = ready();
    if (!session.ok) return session;
    const record = records.find((item) => item.id === input.id);
    if (!record)
      return failure(
        'NOT_FOUND',
        'Appointment not found. Reload the daily flow.',
      );
    if (record.revision !== input.expectedRevision)
      return failure(
        'CONFLICT',
        'This appointment changed. Reload the daily flow and check its current state.',
      );
    if (correction && !input.reason?.trim())
      return failure('VALIDATION', 'Add a reason for the correction.');
    if (!canChangeAppointment(session.data, record, input.status, correction)) {
      const intake = canScheduleAppointments(session.data);
      const own =
        (session.data.role === 'doctor' && record.discipline === 'medical') ||
        (session.data.role === 'dentist' && record.discipline === 'dental') ||
        (session.data.role === 'medtech' && record.discipline === 'laboratory');
      const intakeStates: AppointmentStatus[] = [
        'scheduled',
        'arrived',
        'waiting',
        'no_show',
      ];
      const permitted =
        own ||
        (intake &&
          (correction
            ? intakeStates.includes(record.status) &&
              intakeStates.includes(input.status)
            : ['arrived', 'waiting', 'no_show'].includes(input.status))) ||
        (!correction &&
          session.data.role === 'medtech' &&
          record.status === 'lab' &&
          input.status === 'with_provider');
      return failure(
        permitted ? 'CONFLICT' : 'DENIED',
        permitted
          ? 'This step is not available. Check the appointment state and scheduled time, or add a correction.'
          : 'Your account cannot make this appointment change. Ask the staff responsible for this step.',
      );
    }
    const now = new Date().toISOString();
    record.history.push({
      id: crypto.randomUUID(),
      revision: record.revision + 1,
      kind: correction ? 'correction' : 'transition',
      fromStatus: record.status,
      toStatus: input.status,
      actorId: session.data.id,
      actorName: session.data.displayName,
      occurredAt: now,
      reason: correction ? input.reason!.trim() : null,
    });
    Object.assign(record, {
      status: input.status,
      revision: record.revision + 1,
      statusChangedAt: now,
      updatedAt: now,
      updatedById: session.data.id,
      updatedByName: session.data.displayName,
    });
    return success(record);
  }
  return {
    snapshotAppointments: () => structuredClone(records),
    async listAppointments(input): Promise<Result<Appointment[]>> {
      const session = ready();
      if (!session.ok) return session;
      const start = Date.parse(`${input.date}T00:00:00+08:00`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
        !Number.isFinite(start) ||
        new Date(start + 28800000).toISOString().slice(0, 10) !== input.date
      )
        return failure('VALIDATION', 'Choose a valid clinic date.');
      return success(
        records
          .filter(
            (record) =>
              Date.parse(record.scheduledAt) >= start &&
              Date.parse(record.scheduledAt) < start + 86400000 &&
              (!input.discipline || record.discipline === input.discipline) &&
              (!input.clinicId || record.clinicId === input.clinicId),
          )
          .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
      );
    },
    async createAppointment(input): Promise<Result<Appointment>> {
      const session = ready();
      if (!session.ok) return session;
      if (!canScheduleAppointments(session.data))
        return failure(
          'DENIED',
          'Ask the clerk or nursing attendant to schedule this patient.',
        );
      const patient = getPatient(input.patientId);
      if (!patient)
        return failure(
          'NOT_FOUND',
          'Patient not found. Select a patient from the registry.',
        );
      if (
        !['medical', 'dental', 'laboratory'].includes(input.discipline) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?\+08:00$/.test(
          input.scheduledAt,
        ) ||
        !Number.isFinite(Date.parse(input.scheduledAt))
      )
        return failure(
          'VALIDATION',
          'Choose a discipline and a valid Manila appointment time.',
        );
      const local = new Date(
        Date.parse(input.scheduledAt) + 28800000,
      ).toISOString();
      if (
        local.slice(0, 16) !== input.scheduledAt.slice(0, 16) ||
        (input.scheduledAt.length > 22 &&
          local.slice(17, 19) !== input.scheduledAt.slice(17, 19))
      )
        return failure('VALIDATION', 'Choose a valid Manila appointment time.');
      const now = new Date().toISOString();
      const record: Appointment = {
        id: crypto.randomUUID(),
        patientId: patient.id,
        patientName: patient.fullName,
        patientDateOfBirth: patient.dateOfBirth,
        clinicId: 'synthetic-clinic',
        discipline: input.discipline,
        scheduledAt: new Date(input.scheduledAt).toISOString(),
        queueNumber:
          Math.max(
            0,
            ...records
              .filter(
                (item) =>
                  item.discipline === input.discipline &&
                  new Date(Date.parse(item.scheduledAt) + 28800000)
                    .toISOString()
                    .slice(0, 10) === local.slice(0, 10),
              )
              .map((item) => item.queueNumber),
          ) + 1,
        status: 'scheduled',
        revision: 1,
        statusChangedAt: now,
        createdById: session.data.id,
        createdByName: session.data.displayName,
        updatedById: session.data.id,
        updatedByName: session.data.displayName,
        createdAt: now,
        updatedAt: now,
        history: [
          {
            id: crypto.randomUUID(),
            revision: 1,
            kind: 'scheduled',
            fromStatus: null,
            toStatus: 'scheduled',
            actorId: session.data.id,
            actorName: session.data.displayName,
            occurredAt: now,
            reason: null,
          },
        ],
      };
      records.push(record);
      return success(record);
    },
    transitionAppointment: (input) => change(input, false),
    correctAppointment: (input) => change(input, true),
  };
}
