import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AuditEvent, AuditQuery } from '../../shared/operations-api';
import { auditActions } from '../../shared/operations-api';
import type { ClinicApi, ClinicError } from './contract';
import { ErrorNotice, Field } from './ui';
import { today, timestamp } from './format';

interface AuditPage {
  api: ClinicApi;
  query: AuditQuery;
  onExpired: () => void;
  events: AuditEvent[];
  cursor: string | null;
  error: ClinicError | null;
  busy: boolean;
}

export function AuditViewer({
  api,
  onExpired,
}: {
  api: ClinicApi;
  onExpired: () => void;
}): ReactElement {
  const [filters, setFilters] = useState<AuditQuery>({
    from: today(),
    to: today(),
  });
  const [applied, setApplied] = useState(filters);
  const [actorState, setActorState] = useState<{
    api: ClinicApi;
    onExpired: () => void;
    actors: { id: string; displayName: string }[];
    error: ClinicError | null;
  } | null>(null);
  const [page, setPage] = useState<AuditPage | null>(null);
  const request = useRef<symbol | null>(null);
  const current =
    page?.api === api && page.query === applied && page.onExpired === onExpired
      ? page
      : null;
  const currentActors =
    actorState?.api === api && actorState.onExpired === onExpired
      ? actorState
      : null;
  const actors = currentActors?.actors ?? [];
  const events = current?.events ?? [];
  const cursor = current?.cursor ?? null;
  const busy = current === null || current.busy;
  const error = current?.error ?? currentActors?.error ?? null;
  useEffect(() => {
    let active = true;
    void api
      .listAuditActors()
      .then((result) => {
        if (!active) return;
        setActorState({
          api,
          onExpired,
          actors: result.ok ? result.data : [],
          error: result.ok ? null : result.error,
        });
        if (!result.ok && result.error.code === 'UNAUTHENTICATED') onExpired();
      })
      .catch(() => {
        if (active)
          setActorState({
            api,
            onExpired,
            actors: [],
            error: {
              code: 'UNAVAILABLE',
              message:
                'Staff filters could not load. Check the clinic connection and reopen the audit trail.',
            },
          });
      });
    return (): void => {
      active = false;
    };
  }, [api, onExpired]);
  useEffect(() => {
    const sequence = Symbol();
    request.current = sequence;
    void api
      .listAuditEvents(applied)
      .then((result) => {
        if (request.current !== sequence) return;
        setPage({
          api,
          query: applied,
          onExpired,
          events: result.ok ? result.data.events : [],
          cursor: result.ok ? result.data.nextCursor : null,
          error: result.ok ? null : result.error,
          busy: false,
        });
        if (!result.ok && result.error.code === 'UNAUTHENTICATED') onExpired();
      })
      .catch(() => {
        if (request.current === sequence)
          setPage({
            api,
            query: applied,
            onExpired,
            events: [],
            cursor: null,
            error: {
              code: 'UNAVAILABLE',
              message:
                'Audit trail unavailable. Check the clinic connection and apply filters again.',
            },
            busy: false,
          });
      });
    return (): void => {
      request.current = null;
    };
  }, [api, applied, onExpired]);
  async function more(): Promise<void> {
    if (!current || !cursor || busy) return;
    const sequence = Symbol();
    request.current = sequence;
    setPage({ ...current, busy: true, error: null });
    try {
      const result = await api.listAuditEvents({ ...applied, cursor });
      if (sequence !== request.current) return;
      setPage({
        ...current,
        events: result.ok
          ? [...current.events, ...result.data.events]
          : current.events,
        cursor: result.ok ? result.data.nextCursor : current.cursor,
        error: result.ok ? null : result.error,
        busy: false,
      });
      if (!result.ok && result.error.code === 'UNAUTHENTICATED') onExpired();
    } catch {
      if (sequence === request.current)
        setPage({
          ...current,
          error: {
            code: 'UNAVAILABLE',
            message:
              'More audit events could not load. Check the clinic connection and retry.',
          },
          busy: false,
        });
    }
  }
  const changed = JSON.stringify(filters) !== JSON.stringify(applied);
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Audit trail</h1>
          <p className="hint">
            Who accessed or changed clinic records. Clinical text and
            credentials are excluded.
          </p>
        </div>
      </div>
      <form
        className="panel form-panel"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({ ...filters });
        }}
      >
        <div className="form-grid">
          <Field label="From" name="audit-from">
            <Input
              id="audit-from"
              type="date"
              required
              value={filters.from}
              max={filters.to}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </Field>
          <Field label="To" name="audit-to">
            <Input
              id="audit-to"
              type="date"
              required
              value={filters.to}
              min={filters.from}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </Field>
          <Field label="Staff member" name="audit-actor">
            <select
              id="audit-actor"
              value={filters.actorId ?? ''}
              onChange={(e) =>
                setFilters({ ...filters, actorId: e.target.value || undefined })
              }
            >
              <option value="">All staff</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Action" name="audit-action">
            <select
              id="audit-action"
              value={filters.action ?? ''}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  action: (e.target.value as AuditQuery['action']) || undefined,
                })
              }
            >
              <option value="">All actions</option>
              {auditActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Patient ID (optional)" name="audit-patient">
            <Input
              id="audit-patient"
              value={filters.patientId ?? ''}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  patientId: e.target.value || undefined,
                })
              }
            />
          </Field>
          <Field label="Record ID (optional)" name="audit-resource">
            <Input
              id="audit-resource"
              value={filters.resourceId ?? ''}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  resourceId: e.target.value || undefined,
                })
              }
            />
          </Field>
        </div>
        <Button disabled={busy || filters.from > filters.to}>
          Apply audit filters
        </Button>
        {changed && (
          <p role="status" className="hint">
            Filters changed. Apply filters to update the events.
          </p>
        )}
      </form>
      <ErrorNotice error={error} />
      {busy && <p role="status">Loading audit events…</p>}
      {!busy && !error && events.length === 0 && (
        <p className="panel">
          No audit events in this range. Change the dates or filters.
        </p>
      )}
      {events.length > 0 && (
        <>
          <p className="hint">
            Scroll the table horizontally to see all columns.
          </p>
          <div
            className="operations-table"
            role="region"
            aria-label="Audit events"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Staff</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Patient ID</th>
                  <th>Outcome</th>
                  <th>Context</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{timestamp(event.createdAt)}</td>
                    <td>{event.actorName}</td>
                    <td>{event.action}</td>
                    <td>
                      {event.resourceType}
                      <br />
                      <span className="hint">{event.resourceId ?? '—'}</span>
                    </td>
                    <td>{event.patientId ?? '—'}</td>
                    <td>{event.outcome}</td>
                    <td>
                      {event.source}
                      {event.workstation ? ` · ${event.workstation}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {cursor && (
        <Button
          variant="outline"
          disabled={busy || changed}
          onClick={() => void more()}
        >
          Load more audit events
        </Button>
      )}
    </section>
  );
}
