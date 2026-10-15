import { Injectable } from '@nestjs/common';
import { recordAudit } from './audit/audit.service';
import { clinicId, serverMode } from './config';
import { DatabaseService } from './database/database.service';
import { fail } from './errors';
import type { Prisma } from './generated/prisma/client';
import type { Principal } from './mirror-contract';
import { manilaDay } from './clinic-dates';
import {
  dateOnly,
  discipline,
  instant,
  invalid,
  object,
  revision,
  text,
  uuid,
} from './validation';

type Status =
  | 'scheduled'
  | 'arrived'
  | 'waiting'
  | 'with_provider'
  | 'lab'
  | 'completed'
  | 'no_show';
const statuses: readonly Status[] = [
  'scheduled',
  'arrived',
  'waiting',
  'with_provider',
  'lab',
  'completed',
  'no_show',
];
const next: Record<Status, readonly Status[]> = {
  scheduled: ['arrived', 'no_show'],
  arrived: ['waiting'],
  waiting: ['with_provider', 'lab'],
  with_provider: ['lab', 'completed'],
  lab: ['with_provider', 'completed'],
  completed: [],
  no_show: [],
};
const include = {
  patient: { select: { fullName: true, dateOfBirth: true } },
  createdBy: { select: { displayName: true } },
  updatedBy: { select: { displayName: true } },
  history: {
    orderBy: { revision: 'asc' },
    include: { actor: { select: { displayName: true } } },
  },
} satisfies Prisma.AppointmentInclude;
type RecordWithHistory = Prisma.AppointmentGetPayload<{
  include: typeof include;
}>;
type AppointmentDto = Omit<
  RecordWithHistory,
  | 'patient'
  | 'createdBy'
  | 'updatedBy'
  | 'history'
  | 'scheduledAt'
  | 'queueDay'
  | 'statusChangedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  patientName: string;
  patientDateOfBirth: string | null;
  createdByName: string;
  updatedByName: string;
  scheduledAt: string;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
  history: {
    id: string;
    revision: number;
    kind: string;
    fromStatus: string | null;
    toStatus: string;
    actorId: string;
    actorName: string;
    occurredAt: string;
    reason: string | null;
  }[];
};
function dto(record: RecordWithHistory): AppointmentDto {
  return {
    id: record.id,
    patientId: record.patientId,
    patientName: record.patient.fullName,
    patientDateOfBirth: record.patient.dateOfBirth,
    clinicId: record.clinicId,
    discipline: record.discipline,
    scheduledAt: record.scheduledAt.toISOString(),
    queueNumber: record.queueNumber,
    status: record.status,
    revision: record.revision,
    statusChangedAt: record.statusChangedAt.toISOString(),
    createdById: record.createdById,
    createdByName: record.createdBy.displayName,
    updatedById: record.updatedById,
    updatedByName: record.updatedBy.displayName,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    history: record.history.map((event) => ({
      id: event.id,
      revision: event.revision,
      kind: event.kind,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actorId: event.actorId,
      actorName: event.actor.displayName,
      occurredAt: event.occurredAt.toISOString(),
      reason: event.reason,
    })),
  };
}
function edge(): void {
  if (serverMode() !== 'EDGE')
    fail(403, 'FORBIDDEN', 'Use the clinic server for appointment work.');
}
function deny(): never {
  return fail(
    403,
    'FORBIDDEN',
    'Your account cannot make this appointment change. Ask the clinic staff responsible for this step.',
  );
}
function status(value: unknown): Status {
  if (typeof value !== 'string' || !statuses.includes(value as Status))
    invalid('status');
  return value as Status;
}
function scheduledInstant(value: unknown): Date {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?\+08:00$/.test(
      value,
    )
  )
    invalid('scheduledAt');
  dateOnly(value.slice(0, 10), 'scheduledAt');
  const result = instant(value, 'scheduledAt');
  const local = new Date(result.getTime() + 8 * 60 * 60 * 1000).toISOString();
  if (
    local.slice(0, 16) !== value.slice(0, 16) ||
    (value.length > 22 && local.slice(17, 19) !== value.slice(17, 19))
  )
    invalid('scheduledAt');
  return result;
}
function owns(staff: Principal, area: string): boolean {
  return (
    (staff.role === 'doctor' && area === 'medical') ||
    (staff.role === 'dentist' && area === 'dental') ||
    (staff.role === 'medtech' && area === 'laboratory')
  );
}
function intake(staff: Principal): boolean {
  return staff.role === 'clerk' || staff.role === 'attendant';
}

@Injectable()
export class AppointmentsService {
  constructor(private readonly db: DatabaseService) {}

  async list(
    _staff: Principal,
    query: unknown,
  ): Promise<ReturnType<typeof dto>[]> {
    edge();
    const input = object(query, ['date', 'clinicId', 'discipline']);
    const day = dateOnly(input.date, 'date');
    const site =
      input.clinicId === undefined
        ? clinicId()
        : text(input.clinicId, 'clinicId', true, 80)!;
    if (site !== clinicId()) return [];
    const area =
      input.discipline === undefined
        ? undefined
        : discipline(
            typeof input.discipline === 'string' ? input.discipline : '',
          );
    const start = new Date(`${day}T00:00:00+08:00`);
    const records = await this.db.appointment.findMany({
      where: {
        clinicId: site,
        discipline: area,
        scheduledAt: { gte: start, lt: new Date(start.getTime() + 86400000) },
      },
      include,
      orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
      take: 10000,
    });
    return records.map(dto);
  }

  async create(
    staff: Principal,
    input: unknown,
  ): Promise<ReturnType<typeof dto>> {
    edge();
    if (!intake(staff)) deny();
    const body = object(input, ['patientId', 'discipline', 'scheduledAt']);
    const patientId = uuid(body.patientId, 'patientId');
    const area = discipline(
      typeof body.discipline === 'string' ? body.discipline : '',
    );
    const scheduledAt = scheduledInstant(body.scheduledAt);
    const queueDay = manilaDay(scheduledAt);
    const site = clinicId();
    return this.db.$transaction(async (tx) => {
      if (
        !(await tx.patient.findUnique({
          where: { id: patientId },
          select: { id: true },
        }))
      )
        fail(
          404,
          'NOT_FOUND',
          'Patient not found. Select a patient from the registry.',
        );
      // Hold the same department/day lock until this transaction commits.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${JSON.stringify([site, area, queueDay])}, 0))`;
      const latest = await tx.appointment.aggregate({
        where: { clinicId: site, discipline: area, queueDay },
        _max: { queueNumber: true },
      });
      const record = await tx.appointment.create({
        data: {
          patientId,
          clinicId: site,
          discipline: area,
          scheduledAt,
          queueDay,
          queueNumber: (latest._max.queueNumber ?? 0) + 1,
          createdById: staff.id,
          updatedById: staff.id,
          history: {
            create: {
              revision: 1,
              kind: 'scheduled',
              toStatus: 'scheduled',
              actorId: staff.id,
            },
          },
        },
        include,
      });
      await recordAudit(tx, staff, {
        action: 'create',
        resourceType: 'appointment',
        resourceId: record.id,
        patientId: record.patientId,
      });
      return dto(record);
    });
  }

  async change(
    staff: Principal,
    id: string,
    input: unknown,
    correction = false,
  ): Promise<ReturnType<typeof dto>> {
    edge();
    uuid(id);
    const body = object(
      input,
      correction
        ? ['expectedRevision', 'status', 'reason']
        : ['expectedRevision', 'status'],
    );
    const wanted = revision(body.expectedRevision);
    const target = status(body.status);
    const reason = correction ? text(body.reason, 'reason', true, 4000)! : null;
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Appointment" WHERE id = ${id}::uuid FOR UPDATE`;
      const previous = await tx.appointment.findUnique({ where: { id } });
      if (!previous || previous.clinicId !== clinicId())
        fail(404, 'NOT_FOUND', 'Appointment not found. Reload the daily flow.');
      if (previous.revision !== wanted)
        fail(
          409,
          'STALE_REVISION',
          'This appointment changed. Reload the daily flow and check its current state.',
          { currentRevision: previous.revision },
        );
      const from = status(previous.status);
      const intakeStates: readonly Status[] = [
        'scheduled',
        'arrived',
        'waiting',
        'no_show',
      ];
      const allowed =
        owns(staff, previous.discipline) ||
        (intake(staff) &&
          (correction
            ? intakeStates.includes(from) && intakeStates.includes(target)
            : ['arrived', 'waiting', 'no_show'].includes(target))) ||
        (!correction &&
          staff.role === 'medtech' &&
          from === 'lab' &&
          target === 'with_provider');
      if (!allowed) deny();
      if (
        target === from ||
        (!correction && !next[from].includes(target)) ||
        (!correction &&
          previous.discipline === 'laboratory' &&
          target === 'with_provider') ||
        (!correction &&
          previous.discipline !== 'laboratory' &&
          from === 'waiting' &&
          target === 'lab') ||
        (target === 'no_show' && previous.scheduledAt.getTime() > Date.now())
      ) {
        fail(
          409,
          'LIFECYCLE_CONFLICT',
          'This step is not available. Check the appointment state and scheduled time, or add a correction.',
        );
      }
      const now = new Date();
      await recordAudit(tx, staff, {
        action: correction ? 'correction' : 'change',
        resourceType: 'appointment',
        resourceId: previous.id,
        patientId: previous.patientId,
      });
      return dto(
        await tx.appointment.update({
          where: { id },
          data: {
            status: target,
            revision: { increment: 1 },
            statusChangedAt: now,
            updatedById: staff.id,
            history: {
              create: {
                revision: wanted + 1,
                kind: correction ? 'correction' : 'transition',
                fromStatus: from,
                toStatus: target,
                actorId: staff.id,
                occurredAt: now,
                reason,
              },
            },
          },
          include,
        }),
      );
    });
  }
}
