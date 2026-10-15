import type { Appointment } from '../../shared/appointments-api';
import type { LabOrder } from '../../shared/laboratory-api';
import { auditActions } from '../../shared/operations-api';
import type {
  AuditAction,
  AuditEvent,
  AuditQuery,
  ClinicReport,
  OperationsResponses,
  ReportQuery,
} from '../../shared/operations-api';
import type { ClinicError, Principal, Result } from './contract';
import type { ReportsApi } from './reports-contract';

export interface OperationsDemoContext {
  getStaff: () => Principal | null;
  isAvailable: () => boolean;
  getStaffList: () => { id: string; displayName: string }[];
  getPatientRegistrations: () => { id: string; createdAt: string }[];
  getAppointments: () => Appointment[];
  getLabOrders: () => LabOrder[];
}
export interface DemoAuditInput {
  action: AuditAction;
  resourceType: string;
  patientId?: string;
  resourceId?: string;
  outcome?: AuditEvent['outcome'];
  source?: 'clinic-api' | 'desktop-print' | 'synthetic-demo';
  workstation?: string;
}
export interface OperationsDemoApi extends ReportsApi {
  listAuditEvents(
    input: AuditQuery,
  ): Promise<Result<OperationsResponses['listAuditEvents']>>;
  listAuditActors(): Promise<Result<OperationsResponses['listAuditActors']>>;
}
type Range = ReportQuery & { start: number; end: number };
function failure<T>(code: ClinicError['code'], message: string): Result<T> {
  return { ok: false, error: { code, message } };
}
function success<T>(data: T): Result<T> {
  return { ok: true, data: structuredClone(data) };
}
function range(input: ReportQuery): Result<Range> {
  for (const day of [input.from, input.to]) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(Date.parse(day)) ||
      new Date(day).toISOString().slice(0, 10) !== day
    )
      return failure('VALIDATION', 'Choose valid start and end dates.');
  }
  const start = Date.parse(`${input.from}T00:00:00+08:00`);
  const end = Date.parse(`${input.to}T00:00:00+08:00`) + 86400000;
  if (end <= start || end - start > 366 * 86400000)
    return failure(
      'VALIDATION',
      'Choose an inclusive date range of up to 366 days, with the start date before the end date.',
    );
  return { ok: true, data: { from: input.from, to: input.to, start, end } };
}
function reportCsv(report: ClinicReport): string {
  const rows: (string | number | null)[][] = [
    ['section', 'label', 'value', 'unit'],
    ['range', 'From', report.from, 'date'],
    ['range', 'To', report.to, 'date'],
    ['summary', 'Visits', report.totals.visits, 'count'],
    ['summary', 'No-shows', report.totals.noShows, 'count'],
    ['summary', 'Pending laboratories', report.totals.pendingLabs, 'count'],
    [
      'summary',
      'Average laboratory turnaround',
      report.totals.averageLabMinutes,
      'minutes',
    ],
    [
      'summary',
      'New patient registrations',
      report.totals.newPatients,
      'count',
    ],
    ...report.daily.map((row) => ['daily', row.date, row.visits, 'visits']),
    ...report.departments.map((row) => [
      'department',
      row.discipline,
      row.patients,
      'patients',
    ]),
  ];
  return (
    rows
      .map((row) =>
        row
          .map((value) => {
            const cell = String(value ?? '');
            return /[",\r\n]/.test(cell)
              ? `"${cell.replaceAll('"', '""')}"`
              : cell;
          })
          .join(','),
      )
      .join('\r\n') + '\r\n'
  );
}

// Explicit in-memory synthetic fixture. Never use this adapter for clinic records.
export function createOperationsDemo(context: OperationsDemoContext): {
  api: OperationsDemoApi;
  record: (event: DemoAuditInput) => void;
} {
  const events: AuditEvent[] = [];
  function authorize(scope: 'audit' | 'reports'): Result<Principal> {
    if (!context.isAvailable())
      return failure(
        'UNAVAILABLE',
        'The clinic server is unavailable. Check the connection and try again.',
      );
    const staff = context.getStaff();
    if (!staff) return failure('UNAUTHENTICATED', 'Sign in to continue.');
    if (
      scope === 'audit'
        ? !staff.isHead
        : !staff.isHead && !['clerk', 'attendant'].includes(staff.role)
    )
      return failure(
        'DENIED',
        scope === 'audit'
          ? 'Only the clinic head can review the audit trail.'
          : 'Ask the clinic head, clerk or nursing attendant to open operational reports.',
      );
    return { ok: true, data: staff };
  }
  function record(input: DemoAuditInput): void {
    const staff = context.getStaff();
    if (!staff) return;
    events.push({
      id: crypto.randomUUID(),
      actorId: staff.id,
      actorName: staff.displayName,
      actorRole: staff.role,
      action: input.action,
      patientId: input.patientId ?? null,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      outcome: input.outcome ?? 'success',
      source: input.source ?? 'synthetic-demo',
      workstation: input.workstation ?? null,
      createdAt: new Date().toISOString(),
    });
  }
  async function aggregate(input: ReportQuery): Promise<Result<ClinicReport>> {
    const session = authorize('reports');
    if (!session.ok) return session;
    const parsed = range(input);
    if (!parsed.ok) return parsed;
    const selected = parsed.data;
    const inRange = (instant: string): boolean =>
      Date.parse(instant) >= selected.start &&
      Date.parse(instant) < selected.end;
    const appointments = context
      .getAppointments()
      .filter((appointment) => inRange(appointment.scheduledAt));
    const labs = context
      .getLabOrders()
      .filter((order) => inRange(order.createdAt));
    const daily = new Map<string, number>();
    for (
      let day = new Date(`${selected.from}T00:00:00Z`);
      day.getTime() <= Date.parse(`${selected.to}T00:00:00Z`);
      day = new Date(day.getTime() + 86400000)
    )
      daily.set(day.toISOString().slice(0, 10), 0);
    const departments = new Map<
      'medical' | 'dental' | 'laboratory',
      Set<string>
    >([
      ['medical', new Set()],
      ['dental', new Set()],
      ['laboratory', new Set()],
    ]);
    let visits = 0;
    let noShows = 0;
    for (const appointment of appointments) {
      if (appointment.status === 'no_show') noShows++;
      if (
        !['arrived', 'waiting', 'with_provider', 'lab', 'completed'].includes(
          appointment.status,
        )
      )
        continue;
      visits++;
      const day = new Date(Date.parse(appointment.scheduledAt) + 28800000)
        .toISOString()
        .slice(0, 10);
      daily.set(day, (daily.get(day) ?? 0) + 1);
      departments.get(appointment.discipline)?.add(appointment.patientId);
    }
    const turnarounds = labs.flatMap((order) => {
      const finalized = order.results
        .filter((result) => result.status === 'finalized' && result.finalizedAt)
        .sort(
          (a, b) => Date.parse(a.finalizedAt!) - Date.parse(b.finalizedAt!),
        )[0];
      return finalized?.finalizedAt
        ? [
            (Date.parse(finalized.finalizedAt) - Date.parse(order.createdAt)) /
              60000,
          ]
        : [];
    });
    if (turnarounds.some((minutes) => !Number.isFinite(minutes) || minutes < 0))
      return failure(
        'UNAVAILABLE',
        'Laboratory timestamps are not valid. Check the synthetic lab data, then refresh the report.',
      );
    const totals: ClinicReport['totals'] = {
      visits,
      noShows,
      pendingLabs: labs.filter((order) =>
        ['ordered', 'in_progress'].includes(order.status),
      ).length,
      averageLabMinutes: turnarounds.length
        ? Math.round(
            (turnarounds.reduce((sum, minutes) => sum + minutes, 0) /
              turnarounds.length) *
              10,
          ) / 10
        : null,
      newPatients: context
        .getPatientRegistrations()
        .filter((patient) => inRange(patient.createdAt)).length,
    };
    const content = {
      from: selected.from,
      to: selected.to,
      totals,
      daily: [...daily].map(([date, count]) => ({ date, visits: count })),
      departments: [...departments].map(([discipline, patients]) => ({
        discipline,
        patients: patients.size,
      })),
    };
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(content)),
    );
    const current = authorize('reports');
    if (!current.ok) return current;
    if (current.data.id !== session.data.id)
      return failure(
        'UNAUTHENTICATED',
        'The staff session changed. Sign in again before opening the report.',
      );
    const fingerprint = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    return success({
      ...content,
      generatedAt: new Date().toISOString(),
      fingerprint,
    });
  }
  const api: OperationsDemoApi = {
    async listAuditEvents(
      input,
    ): Promise<Result<OperationsResponses['listAuditEvents']>> {
      const session = authorize('audit');
      if (!session.ok) return session;
      const selected = range(input);
      if (!selected.ok) return selected;
      if (input.action && !auditActions.includes(input.action))
        return failure('VALIDATION', 'Select an available audit action.');
      const rows = events
        .filter(
          (event) =>
            Date.parse(event.createdAt) >= selected.data.start &&
            Date.parse(event.createdAt) < selected.data.end &&
            (!input.actorId || event.actorId === input.actorId) &&
            (!input.patientId || event.patientId === input.patientId) &&
            (!input.resourceId || event.resourceId === input.resourceId) &&
            (!input.action || event.action === input.action),
        )
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
        );
      const cursor = input.cursor
        ? rows.findIndex((event) => event.id === input.cursor)
        : -1;
      if (input.cursor && cursor < 0)
        return failure(
          'VALIDATION',
          'The audit page is no longer available. Reload the audit trail.',
        );
      const page = rows.slice(cursor + 1, cursor + 52);
      return success({
        events: page.slice(0, 50),
        nextCursor: page.length > 50 ? page[49].id : null,
      });
    },
    async listAuditActors(): Promise<
      Result<OperationsResponses['listAuditActors']>
    > {
      const session = authorize('audit');
      return session.ok
        ? success(
            context
              .getStaffList()
              .map(({ id, displayName }) => ({ id, displayName }))
              .sort((a, b) => a.displayName.localeCompare(b.displayName))
              .slice(0, 100),
          )
        : session;
    },
    readReport: aggregate,
    async exportReport(
      input,
    ): Promise<Result<OperationsResponses['exportReport']>> {
      const report = await aggregate(input);
      if (!report.ok) return report;
      if (input.fingerprint !== report.data.fingerprint)
        return failure(
          'CONFLICT',
          'The report changed. Refresh the report before exporting.',
        );
      record({
        action: 'export',
        resourceType: `report:${report.data.from}:${report.data.to}`,
      });
      return success({
        filename: `amlig-report-${report.data.from}-${report.data.to}.csv`,
        csv: reportCsv(report.data),
        fingerprint: report.data.fingerprint,
      });
    },
  };
  return { api, record };
}
