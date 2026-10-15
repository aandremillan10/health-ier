import type {
  Appointment,
  AppointmentEvent,
  AppointmentRequests,
  AppointmentResponses,
} from '../shared/appointments-api';
import {
  array,
  choice,
  date,
  nullable,
  object,
  optional,
  revision,
  text,
  timestamp,
  uuid,
  type Guard,
} from './validation';

const status = choice([
  'scheduled',
  'arrived',
  'waiting',
  'with_provider',
  'lab',
  'completed',
  'no_show',
]);
const discipline = choice(['medical', 'dental', 'laboratory']);
const scheduledAt: Guard<string> = (value) => {
  const result = timestamp(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?\+08:00$/.test(
      result,
    )
  )
    throw new Error('Use Manila time');
  date(result.slice(0, 10));
  const local = new Date(Date.parse(result) + 8 * 60 * 60 * 1000).toISOString();
  if (
    local.slice(0, 16) !== result.slice(0, 16) ||
    (result.length > 22 && local.slice(17, 19) !== result.slice(17, 19))
  )
    throw new Error('Invalid appointment time');
  return result;
};
const reason: Guard<string> = (value) => {
  const result = text(4000, 1)(value).trim();
  if (!result) throw new Error('Add a correction reason');
  return result;
};
const event = object<AppointmentEvent>({
  id: uuid,
  revision,
  kind: choice(['scheduled', 'transition', 'correction']),
  fromStatus: nullable(status),
  toStatus: status,
  actorId: uuid,
  actorName: text(200, 1),
  occurredAt: timestamp,
  reason: nullable(reason),
});
const parseAppointment = object<Appointment>({
  id: uuid,
  patientId: uuid,
  patientName: text(200, 1),
  patientDateOfBirth: nullable(date),
  clinicId: text(80, 1),
  discipline,
  scheduledAt: timestamp,
  status,
  revision,
  statusChangedAt: timestamp,
  createdById: uuid,
  createdByName: text(200, 1),
  updatedById: uuid,
  updatedByName: text(200, 1),
  createdAt: timestamp,
  updatedAt: timestamp,
  history: array(event),
});
const appointment: Guard<Appointment> = (value) => {
  const result = parseAppointment(value);
  const latest = result.history.at(-1);
  if (
    !latest ||
    latest.revision !== result.revision ||
    latest.toStatus !== result.status ||
    result.history.length !== result.revision ||
    result.history.some(
      (item, index) =>
        item.revision !== index + 1 ||
        (index > 0 && item.fromStatus !== result.history[index - 1].toStatus),
    )
  )
    throw new Error('Invalid appointment history');
  return result;
};
const change = { id: uuid, expectedRevision: revision, status };
export const appointmentRequestGuards = {
  listAppointments: object<AppointmentRequests['listAppointments']>({
    date,
    clinicId: optional(text(80, 1)),
    discipline: optional(discipline),
  }),
  createAppointment: object<AppointmentRequests['createAppointment']>({
    patientId: uuid,
    discipline,
    scheduledAt,
  }),
  transitionAppointment:
    object<AppointmentRequests['transitionAppointment']>(change),
  correctAppointment: object<AppointmentRequests['correctAppointment']>({
    ...change,
    reason,
  }),
} satisfies { [K in keyof AppointmentRequests]: Guard<AppointmentRequests[K]> };
export const appointmentResponseGuards = {
  listAppointments: array(appointment),
  createAppointment: appointment,
  transitionAppointment: appointment,
  correctAppointment: appointment,
} satisfies {
  [K in keyof AppointmentResponses]: Guard<AppointmentResponses[K]>;
};

export function appointmentRoute<K extends keyof AppointmentRequests>(
  name: K,
  input: AppointmentRequests[K],
): { path: string; method: 'GET' | 'POST'; body?: unknown } {
  switch (name) {
    case 'listAppointments': {
      const query = appointmentRequestGuards.listAppointments(input);
      const params = new URLSearchParams({ date: query.date });
      if (query.clinicId) params.set('clinicId', query.clinicId);
      if (query.discipline) params.set('discipline', query.discipline);
      return { path: `/appointments?${params.toString()}`, method: 'GET' };
    }
    case 'createAppointment':
      return {
        path: '/appointments',
        method: 'POST',
        body: appointmentRequestGuards.createAppointment(input),
      };
    case 'transitionAppointment': {
      const { id, ...body } =
        appointmentRequestGuards.transitionAppointment(input);
      return { path: `/appointments/${id}/transitions`, method: 'POST', body };
    }
    case 'correctAppointment': {
      const { id, ...body } =
        appointmentRequestGuards.correctAppointment(input);
      return { path: `/appointments/${id}/corrections`, method: 'POST', body };
    }
    default:
      throw new Error('Unknown appointment operation');
  }
}
