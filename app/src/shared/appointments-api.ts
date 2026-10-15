import type { Discipline, Result } from './clinic-api';

export type AppointmentStatus =
  | 'scheduled'
  | 'arrived'
  | 'waiting'
  | 'with_provider'
  | 'lab'
  | 'completed'
  | 'no_show';
export interface AppointmentEvent {
  id: string;
  revision: number;
  kind: 'scheduled' | 'transition' | 'correction';
  fromStatus: AppointmentStatus | null;
  toStatus: AppointmentStatus;
  actorId: string;
  actorName: string;
  occurredAt: string;
  reason: string | null;
}
export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientDateOfBirth: string | null;
  clinicId: string;
  discipline: Discipline;
  scheduledAt: string;
  status: AppointmentStatus;
  revision: number;
  statusChangedAt: string;
  createdById: string;
  createdByName: string;
  updatedById: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  history: AppointmentEvent[];
}
export interface AppointmentRequests {
  listAppointments: {
    date: string;
    clinicId?: string;
    discipline?: Discipline;
  };
  createAppointment: {
    patientId: string;
    discipline: Discipline;
    scheduledAt: string;
  };
  transitionAppointment: {
    id: string;
    expectedRevision: number;
    status: AppointmentStatus;
  };
  correctAppointment: {
    id: string;
    expectedRevision: number;
    status: AppointmentStatus;
    reason: string;
  };
}
export interface AppointmentResponses {
  listAppointments: Appointment[];
  createAppointment: Appointment;
  transitionAppointment: Appointment;
  correctAppointment: Appointment;
}
export type AppointmentWireApi = {
  [K in keyof AppointmentRequests]: (
    input: AppointmentRequests[K],
  ) => Promise<Result<AppointmentResponses[K]>>;
};
