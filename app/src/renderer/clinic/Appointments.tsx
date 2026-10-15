import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  Appointment,
  AppointmentStatus,
} from '../../shared/appointments-api';
import type { ClinicError, Discipline, Patient, Principal } from './contract';
import {
  appointmentStatuses,
  appointmentStatusNames,
  canChangeAppointment,
  canScheduleAppointments,
  type AppointmentApi,
} from './appointments-api';
import { date, timestamp, today } from './format';
import { Confirm, Empty, ErrorNotice, Field, Loading } from './ui';
import { useOperation } from './use-operation';
import './appointments.css';

const actions: Record<AppointmentStatus, string> = {
  scheduled: 'Return to scheduled',
  arrived: 'Mark arrived',
  waiting: 'Move to waiting',
  with_provider: 'Start provider care',
  lab: 'Move to lab',
  completed: 'Complete visit',
  no_show: 'Mark no-show',
};
type Pending = {
  record: Appointment;
  status: AppointmentStatus;
  reason?: string;
  onSaved?: () => void;
};

export function Appointments({
  api,
  staff,
  patient = null,
  onExpired,
  onOpenPatient,
  onDirty,
}: {
  api: AppointmentApi;
  staff: Principal;
  patient?: Patient | null;
  onExpired: () => void;
  onOpenPatient?: (id: string) => void;
  onDirty?: (dirty: boolean) => void;
}): ReactElement {
  const [day, setDay] = useState(today);
  const [area, setArea] = useState<Discipline | ''>('');
  const [site, setSite] = useState('');
  const [board, setBoard] = useState<{
    key: string;
    records: Appointment[] | null;
    error: ClinicError | null;
    loadedAt: string | null;
  }>({ key: '', records: null, error: null, loadedAt: null });
  const [reload, setReload] = useState(0);
  const [automatic, setAutomatic] = useState(true);
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [time, setTime] = useState('09:00');
  const [scheduleArea, setScheduleArea] = useState<Discipline>('medical');
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [dirtyCorrections, setDirtyCorrections] = useState<
    Record<string, boolean>
  >({});
  const operation = useOperation(onExpired);
  const queryKey = `${day}|${area}|${site}`;
  const validDay = /^\d{4}-\d{2}-\d{2}$/.test(day);
  const loading = validDay && board.key !== queryKey;
  const records = board.key === queryKey ? board.records : null;
  const loadError = !validDay
    ? {
        code: 'VALIDATION' as const,
        message: 'Choose a valid clinic date to load the daily flow.',
      }
    : board.key === queryKey
      ? board.error
      : null;
  const loadedAt = board.loadedAt;
  const hasCorrections = Object.values(dirtyCorrections).some(Boolean);

  useEffect(() => {
    let active = true;
    let lastRequest = 0;
    if (!validDay) return;
    async function load(): Promise<void> {
      const request = ++lastRequest;
      try {
        const result = await api.listAppointments({
          date: day,
          ...(area ? { discipline: area } : {}),
          ...(site ? { clinicId: site } : {}),
        });
        if (!active || request !== lastRequest) return;
        if (result.ok) {
          setBoard({
            key: queryKey,
            records: result.data,
            error: null,
            loadedAt: new Date().toISOString(),
          });
        } else {
          setBoard((previous) => ({
            ...previous,
            key: queryKey,
            records: previous.key === queryKey ? previous.records : null,
            error: result.error,
          }));
          if (result.error.code === 'UNAUTHENTICATED') onExpired();
        }
      } catch {
        if (active && request === lastRequest)
          setBoard((previous) => ({
            ...previous,
            key: queryKey,
            records: previous.key === queryKey ? previous.records : null,
            error: {
              code: 'UNAVAILABLE',
              message:
                'Unable to load the daily flow. Check the clinic connection, then select Refresh daily flow.',
            },
          }));
      }
    }
    void load();
    const timer = automatic
      ? setInterval(() => {
          if (!document.hidden) void load();
        }, 15000)
      : null;
    function focus(): void {
      if (automatic) void load();
    }
    window.addEventListener('focus', focus);
    return (): void => {
      active = false;
      if (timer) clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [api, day, area, site, queryKey, validDay, reload, automatic, onExpired]);

  function correctionDirty(id: string, dirty: boolean): void {
    const next = { ...dirtyCorrections, [id]: dirty };
    setDirtyCorrections(next);
    onDirty?.(scheduleDirty || Object.values(next).some(Boolean));
  }

  function refresh(): void {
    operation.clearError();
    setPending(null);
    setReload((value) => value + 1);
  }
  async function schedule(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!patient) return;
    const result = await operation.run(() =>
      api.createAppointment({
        patientId: patient.id,
        discipline: scheduleArea,
        scheduledAt: `${day}T${time}:00+08:00`,
      }),
    );
    if (result) {
      setNotice(
        `Appointment saved for ${result.patientName} at ${timestamp(result.scheduledAt)}.`,
      );
      setScheduleDirty(false);
      onDirty?.(hasCorrections);
      setReload((value) => value + 1);
    }
  }
  async function confirm(): Promise<void> {
    if (!pending || operation.conflict) return;
    const { record, status, reason } = pending;
    const input = { id: record.id, expectedRevision: record.revision, status };
    const result = await operation.run(() =>
      reason === undefined
        ? api.transitionAppointment(input)
        : api.correctAppointment({ ...input, reason }),
    );
    if (result) {
      pending.onSaved?.();
      setPending(null);
      setNotice(
        `${result.patientName}: ${appointmentStatusNames[result.status]} saved at ${timestamp(result.statusChangedAt)}.`,
      );
      setReload((value) => value + 1);
    }
  }
  const clinics = [...new Set(records?.map((record) => record.clinicId) ?? [])];

  return (
    <div className="appointments-view">
      <div className="page-heading">
        <div>
          <h1>Daily clinic flow</h1>
          <p className="muted">
            Follow appointments from arrival to completion. All times use Manila
            time.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={operation.busy || loading}
          onClick={refresh}
        >
          Refresh daily flow
        </Button>
      </div>
      <section
        className="panel appointment-filters"
        aria-label="Daily flow filters"
      >
        <Field name="appointment-date" label="Clinic date">
          <Input
            id="appointment-date"
            type="date"
            value={day}
            required
            disabled={operation.busy || hasCorrections}
            onChange={(event) => setDay(event.target.value)}
          />
        </Field>
        <Field name="appointment-discipline" label="Discipline">
          <select
            id="appointment-discipline"
            value={area}
            disabled={operation.busy || hasCorrections}
            onChange={(event) => setArea(event.target.value as Discipline | '')}
          >
            <option value="">All disciplines</option>
            <option value="medical">Medical</option>
            <option value="dental">Dental</option>
            <option value="laboratory">Laboratory</option>
          </select>
        </Field>
        <Field name="appointment-clinic" label="Clinic">
          <select
            id="appointment-clinic"
            value={site}
            disabled={operation.busy || hasCorrections}
            onChange={(event) => setSite(event.target.value)}
          >
            <option value="">This clinic</option>
            {[...new Set([...clinics, ...(site ? [site] : [])])].map(
              (clinic) => (
                <option key={clinic} value={clinic}>
                  {clinic}
                </option>
              ),
            )}
          </select>
        </Field>
        <label className="appointment-auto">
          <input
            type="checkbox"
            checked={automatic}
            onChange={(event) => setAutomatic(event.target.checked)}
          />{' '}
          Refresh every 15 seconds
        </label>
      </section>
      {hasCorrections && (
        <p className="hint">
          Save or cancel the state correction before changing the daily flow
          filters.
        </p>
      )}
      <p className="hint">
        {loadedAt
          ? `Last loaded ${timestamp(loadedAt)}.`
          : 'The daily flow has not loaded yet.'}{' '}
        Queue state is operational. Save consultation findings and laboratory
        results in the patient chart.
      </p>
      <p role="status" className={notice ? 'notice success' : 'sr-only'}>
        {notice}
      </p>
      <ErrorNotice error={loadError}>
        <Button variant="outline" onClick={refresh}>
          Refresh daily flow
        </Button>
      </ErrorNotice>
      {!pending && (
        <ErrorNotice error={operation.error}>
          {operation.conflict && (
            <Button variant="outline" onClick={refresh}>
              Reload changed appointment
            </Button>
          )}
        </ErrorNotice>
      )}

      {canScheduleAppointments(staff) && (
        <section className="panel" aria-labelledby="appointment-schedule-title">
          <h2 id="appointment-schedule-title">Schedule selected patient</h2>
          {patient ? (
            <form onSubmit={(event) => void schedule(event)}>
              <div className="appointment-patient">
                <strong>{patient.fullName}</strong>
                <span>Patient number: {patient.id}</span>
                <span>Birth date: {date(patient.dateOfBirth)}</span>
              </div>
              <div className="appointment-schedule-fields">
                <Field
                  name="appointment-time"
                  label={`Time on ${date(day || null)}`}
                  hint="Manila time (UTC+08:00)"
                  error={operation.error}
                  errorName="scheduledAt"
                >
                  <Input
                    id="appointment-time"
                    type="time"
                    step="60"
                    value={time}
                    required
                    disabled={operation.busy}
                    onChange={(event) => {
                      setTime(event.target.value);
                      setScheduleDirty(true);
                      onDirty?.(true);
                    }}
                  />
                </Field>
                <Field
                  name="appointment-new-discipline"
                  label="Discipline"
                  error={operation.error}
                  errorName="discipline"
                >
                  <select
                    id="appointment-new-discipline"
                    value={scheduleArea}
                    disabled={operation.busy}
                    onChange={(event) => {
                      setScheduleArea(event.target.value as Discipline);
                      setScheduleDirty(true);
                      onDirty?.(true);
                    }}
                  >
                    <option value="medical">Medical</option>
                    <option value="dental">Dental</option>
                    <option value="laboratory">Laboratory</option>
                  </select>
                </Field>
                <Button type="submit" disabled={operation.busy || !day}>
                  {operation.busy ? 'Saving appointment…' : 'Save appointment'}
                </Button>
              </div>
            </form>
          ) : (
            <p className="muted">
              Select a patient from the registry, then return here to schedule
              their appointment.
            </p>
          )}
        </section>
      )}

      {loading && <Loading>Loading daily appointments…</Loading>}
      {!loading && records?.length === 0 && (
        <Empty>
          No appointments for {date(day)}
          {area ? ` in ${area}` : ''}. Choose another date or schedule the
          selected patient.
        </Empty>
      )}
      {records && records.length > 0 && (
        <>
          <ol className="appointment-steps" aria-label="Appointment states">
            {appointmentStatuses.map((status) => (
              <li key={status}>
                <span>{appointmentStatusNames[status]}</span>
                <strong>
                  {records.filter((record) => record.status === status).length}
                </strong>
              </li>
            ))}
          </ol>
          <section
            className="panel table-panel"
            aria-labelledby="appointment-list-title"
          >
            <div className="section-heading">
              <h2 id="appointment-list-title">
                Appointments ({records.length})
              </h2>
              {loadError && (
                <span className="badge warning">Last loaded data</span>
              )}
            </div>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Daily appointment list; scroll horizontally for all columns"
            >
              <table className="appointment-table">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Patient</th>
                    <th scope="col">Discipline</th>
                    <th scope="col">Current state</th>
                    <th scope="col">Actions and history</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr
                      key={record.id}
                      className={
                        patient?.id === record.patientId
                          ? 'appointment-selected'
                          : undefined
                      }
                    >
                      <td>
                        <time dateTime={record.scheduledAt}>
                          {new Intl.DateTimeFormat('en-PH', {
                            hour: 'numeric',
                            minute: '2-digit',
                            timeZone: 'Asia/Manila',
                          }).format(new Date(record.scheduledAt))}
                        </time>
                      </td>
                      <td>
                        <strong>{record.patientName}</strong>
                        <span className="appointment-meta">
                          Patient number: {record.patientId}
                        </span>
                        <span className="appointment-meta">
                          Birth date: {date(record.patientDateOfBirth)}
                        </span>
                        {patient?.id === record.patientId && (
                          <span className="badge">Selected patient</span>
                        )}
                        {onOpenPatient && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={operation.busy}
                            aria-label={`Open patient ${record.patientName} ${record.patientId}`}
                            onClick={() => onOpenPatient(record.patientId)}
                          >
                            Open patient
                          </Button>
                        )}
                      </td>
                      <td className="capitalize">{record.discipline}</td>
                      <td>
                        <span
                          className={`badge ${record.status === 'completed' ? 'success' : record.status === 'no_show' ? 'warning' : ''}`}
                        >
                          {appointmentStatusNames[record.status]}
                        </span>
                        <span className="appointment-meta">
                          {timestamp(record.statusChangedAt)}
                        </span>
                        <span className="appointment-meta">
                          By {record.updatedByName}
                        </span>
                      </td>
                      <td>
                        <AppointmentActions
                          record={record}
                          staff={staff}
                          disabled={operation.busy || Boolean(loadError)}
                          onDirty={(dirty) => correctionDirty(record.id, dirty)}
                          onPending={(change) => {
                            operation.clearError();
                            setPending(change);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {pending && (
        <Confirm
          title={`${pending.reason === undefined ? actions[pending.status] : 'Correct workflow state'} for ${pending.record.patientName}?`}
          action={
            operation.conflict
              ? 'Reload daily flow'
              : pending.reason === undefined
                ? actions[pending.status]
                : 'Save state correction'
          }
          busy={operation.busy}
          onCancel={() => {
            setPending(null);
            operation.clearError();
          }}
          onConfirm={() => {
            if (operation.conflict) refresh();
            else void confirm();
          }}
        >
          <p>Patient number: {pending.record.patientId}</p>
          <p>
            {appointmentStatusNames[pending.record.status]} →{' '}
            {appointmentStatusNames[pending.status]}
          </p>
          {pending.reason !== undefined && <p>Reason: {pending.reason}</p>}
          <p className="hint">
            This change is shared with the clinic. The previous state and staff
            attribution remain in history.
          </p>
          <ErrorNotice error={operation.error} />
        </Confirm>
      )}
    </div>
  );
}

function AppointmentActions({
  record,
  staff,
  disabled,
  onPending,
  onDirty,
}: {
  record: Appointment;
  staff: Principal;
  disabled: boolean;
  onPending: (pending: Pending) => void;
  onDirty: (dirty: boolean) => void;
}): ReactElement {
  const [target, setTarget] = useState<AppointmentStatus>('scheduled');
  const [reason, setReason] = useState('');
  const corrections = appointmentStatuses.filter((status) =>
    canChangeAppointment(staff, record, status, true),
  );
  const selected = corrections.includes(target) ? target : corrections[0];
  return (
    <div className="appointment-actions">
      <div className="appointment-buttons">
        {appointmentStatuses
          .filter((status) => canChangeAppointment(staff, record, status))
          .map((status) => (
            <Button
              key={status}
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => onPending({ record, status })}
            >
              {actions[status]}
            </Button>
          ))}
      </div>
      <details>
        <summary>State history ({record.history.length})</summary>
        <ol className="appointment-history">
          {record.history.map((event) => (
            <li key={event.id}>
              <strong>{appointmentStatusNames[event.toStatus]}</strong>
              {event.kind === 'correction' && ' — Correction'}
              <span>
                {timestamp(event.occurredAt)} · {event.actorName}
              </span>
              {event.reason && <p>{event.reason}</p>}
            </li>
          ))}
        </ol>
      </details>
      {corrections.length > 0 && (
        <details>
          <summary>Correct workflow state</summary>
          <form
            className="appointment-correction"
            onSubmit={(event) => {
              event.preventDefault();
              if (selected && reason.trim())
                onPending({
                  record,
                  status: selected,
                  reason: reason.trim(),
                  onSaved: () => {
                    setReason('');
                    onDirty(false);
                  },
                });
            }}
          >
            <Field
              name={`appointment-correction-${record.id}`}
              label="Correct state"
            >
              <select
                id={`appointment-correction-${record.id}`}
                value={selected}
                disabled={disabled}
                onChange={(event) =>
                  setTarget(event.target.value as AppointmentStatus)
                }
              >
                {corrections.map((status) => (
                  <option key={status} value={status}>
                    {appointmentStatusNames[status]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              name={`appointment-reason-${record.id}`}
              label="Reason for correction"
              hint="The original state stays in history."
            >
              <Textarea
                id={`appointment-reason-${record.id}`}
                value={reason}
                required
                maxLength={4000}
                disabled={disabled}
                onChange={(event) => {
                  setReason(event.target.value);
                  event.target.setCustomValidity(
                    event.target.value.trim()
                      ? ''
                      : 'Enter a reason for correction.',
                  );
                  onDirty(Boolean(event.target.value));
                }}
              />
            </Field>
            <div className="appointment-buttons">
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={disabled}
              >
                Review state correction
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  setReason('');
                  onDirty(false);
                }}
              >
                Cancel state correction
              </Button>
            </div>
          </form>
        </details>
      )}
    </div>
  );
}
