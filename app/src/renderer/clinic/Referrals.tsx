import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { LabOrder } from '../../shared/laboratory-api';
import type { PatientIdentity } from '../../shared/clinic-api';
import type {
  Referral,
  ReferralStatus,
  ReferralUnit,
} from '../../shared/referrals-api';
import type { ClinicError, Principal, Result } from './contract';
import type { ReferralsApi } from './referrals-contract';
import { date, timestamp } from './format';
import { Confirm, Empty, ErrorNotice, Field, Loading } from './ui';
import { useOperation } from './use-operation';
import './referrals.css';

const units: Record<ReferralUnit, string> = {
  medical: 'Medical',
  dental: 'Dental',
  laboratory: 'Laboratory',
};
const states: Record<ReferralStatus, string> = {
  pending: 'Pending acceptance',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};
const active = (referral: Referral): boolean =>
  ['pending', 'accepted', 'in_progress'].includes(referral.status);
type WorkspaceApi = ReferralsApi & {
  listLabOrders: (input: { patientId: string }) => Promise<Result<LabOrder[]>>;
};

export function Referrals({
  api,
  staff,
  patient,
  demo = false,
  onExpired,
  onDirty,
}: {
  api: WorkspaceApi;
  staff: Principal;
  patient?: PatientIdentity;
  demo?: boolean;
  onExpired?: () => void;
  onDirty?: (dirty: boolean) => void;
}): ReactElement {
  const [referrals, setReferrals] = useState<Referral[] | null>(null);
  const [selected, setSelected] = useState<Referral | null>(null);
  const [view, setView] = useState<'inbox' | 'sent'>('inbox');
  const [scope, setScope] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ClinicError | null>(null);
  const [labs, setLabs] = useState<LabOrder[] | null>(null);
  const [labError, setLabError] = useState<ClinicError | null>(null);
  const [form, setForm] = useState<
    'create' | 'complete' | 'cancel' | 'reject' | null
  >(null);
  const [receiving, setReceiving] = useState<ReferralUnit>(
    staff.role === 'doctor' ? 'dental' : 'medical',
  );
  const [reason, setReason] = useState('');
  const [labOrderId, setLabOrderId] = useState('');
  const [labResultId, setLabResultId] = useState('');
  const [completionNote, setCompletionNote] = useState('');
  const [completionReference, setCompletionReference] = useState('');
  const [confirmation, setConfirmation] = useState<
    'complete' | 'cancel' | 'reject' | 'discard' | null
  >(null);
  const [notice, setNotice] = useState('');
  const { busy, error, conflict, run, clearError } = useOperation(onExpired);
  const workflowBlocked = busy || conflict || loadError !== null;
  useEffect(() => {
    onDirty?.(form !== null);
    return (): void => onDirty?.(false);
  }, [form, onDirty]);
  const requests = useRef(0);
  const labRequests = useRef(0);
  const patientId = patient?.id;
  const provider = staff.role === 'doctor' || staff.role === 'dentist';
  const staffUnit: ReferralUnit | null =
    staff.role === 'doctor'
      ? 'medical'
      : staff.role === 'dentist'
        ? 'dental'
        : staff.role === 'medtech'
          ? 'laboratory'
          : null;
  const mayReceive = selected?.receivingDiscipline === staffUnit;
  const ownsTask =
    mayReceive &&
    (!selected?.acceptedById || selected.acceptedById === staff.id);
  const availableOrders =
    labs?.filter(
      (order) =>
        order.orderingProviderId === staff.id &&
        ['ordered', 'in_progress'].includes(order.status),
    ) ?? [];
  const selectedLab = labs?.find((order) => order.id === selected?.labOrderId);
  const finalResults =
    selectedLab && ['resulted', 'reviewed'].includes(selectedLab.status)
      ? selectedLab.results.filter(
          (result) =>
            result.status === 'finalized' &&
            !selectedLab.results.some(
              (next) => next.correctionOfId === result.id,
            ),
        )
      : [];

  const load = useCallback((): Promise<void> => {
    const requestId = ++requests.current;
    const operation = patientId
      ? api.listReferrals({ patientId })
      : view === 'inbox'
        ? api.listReferralInbox({ scope })
        : api.listSentReferrals({ scope });
    return operation
      .then((result) => {
        if (requestId !== requests.current) return;
        setLoadError(null);
        if (result.ok) {
          setReferrals(result.data);
          setSelected((current) =>
            current
              ? (result.data.find((record) => record.id === current.id) ??
                current)
              : null,
          );
          clearError();
        } else {
          setLoadError(result.error);
          if (result.error.code === 'UNAUTHENTICATED') onExpired?.();
        }
      })
      .catch(() => {
        if (requestId === requests.current)
          setLoadError({
            code: 'UNAVAILABLE',
            message:
              'Referrals are unavailable. Check the clinic connection and select Refresh referrals.',
          });
      })
      .finally(() => {
        if (requestId === requests.current) setLoading(false);
      });
  }, [api, patientId, view, scope, clearError, onExpired]);
  useEffect(() => {
    const requestRef = requests;
    void load();
    return (): void => {
      requestRef.current++;
    };
  }, [load]);
  function refresh(): void {
    setLoading(true);
    void load();
  }
  async function loadLabs(id: string): Promise<void> {
    const requestId = ++labRequests.current;
    setLabs(null);
    setLabError(null);
    try {
      const result = await api.listLabOrders({ patientId: id });
      if (requestId !== labRequests.current) return;
      if (result.ok) setLabs(result.data);
      else {
        setLabError(result.error);
        if (result.error.code === 'UNAUTHENTICATED') onExpired?.();
      }
    } catch {
      if (requestId === labRequests.current)
        setLabError({
          code: 'UNAVAILABLE',
          message:
            'Laboratory references are unavailable. Refresh laboratory orders before you retry.',
        });
    }
  }
  function openForm(next: 'create' | 'complete' | 'cancel' | 'reject'): void {
    setForm(next);
    setReason('');
    setCompletionNote('');
    setCompletionReference('');
    setLabResultId('');
    setLabOrderId('');
    clearError();
    setNotice('');
    const id = next === 'create' ? patientId : selected?.patientId;
    if (
      id &&
      (next === 'create' || selected?.receivingDiscipline === 'laboratory')
    )
      void loadLabs(id);
  }
  async function perform(
    operation: () => Promise<Result<Referral>>,
    message: string,
  ): Promise<void> {
    if (loadError) return;
    const result = await run(operation);
    if (!result) return;
    const remains = patientId || scope === 'all' || active(result);
    setReferrals((current) => [
      ...(remains ? [result] : []),
      ...(current ?? []).filter((record) => record.id !== result.id),
    ]);
    setSelected(result);
    setForm(null);
    setConfirmation(null);
    setNotice(
      `${message}${demo ? ' Demo changes remain in memory.' : ' Saved on the clinic server.'}`,
    );
  }
  async function create(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!patient) return;
    await perform(
      () =>
        api.createReferral({
          patientId: patient.id,
          receivingDiscipline: receiving,
          reason,
          labOrderId: receiving === 'laboratory' ? labOrderId : null,
        }),
      'Referral sent to the receiving unit.',
    );
  }
  async function confirm(): Promise<void> {
    if (confirmation === 'discard') {
      setForm(null);
      setConfirmation(null);
      clearError();
      return;
    }
    if (!selected) return;
    if (loadError) {
      setConfirmation(null);
      return;
    }
    const input = { id: selected.id, expectedRevision: selected.revision };
    if (confirmation === 'complete')
      await perform(
        () =>
          api.completeReferral({
            ...input,
            completionNote: completionNote.trim() || null,
            completionReference:
              selected.receivingDiscipline === 'laboratory'
                ? null
                : completionReference.trim() || null,
            labResultId:
              selected.receivingDiscipline === 'laboratory'
                ? labResultId
                : null,
          }),
        'Referral completed. Completion history is preserved.',
      );
    if (confirmation === 'cancel')
      await perform(
        () => api.cancelReferral({ ...input, reason }),
        'Referral cancelled.',
      );
    if (confirmation === 'reject')
      await perform(
        () => api.rejectReferral({ ...input, reason }),
        'Referral rejected.',
      );
    setConfirmation(null);
  }

  if (!staffUnit) return <Empty>Your account cannot access referrals.</Empty>;
  return (
    <section
      className="referrals"
      aria-label={patient ? 'Patient referrals' : 'Referral work queue'}
    >
      <div className="page-heading">
        <div>
          <h2>{patient ? 'Patient referrals' : 'Referrals'}</h2>
          <p className="hint">
            {patient
              ? patient.fullName
              : 'Track hand-offs between medical, dental, and laboratory staff.'}
          </p>
        </div>
        <div className="referral-actions">
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={refresh}
          >
            Refresh referrals
          </Button>
          {provider && patient && (
            <Button
              disabled={busy || form !== null || loadError !== null}
              onClick={() => openForm('create')}
            >
              New referral
            </Button>
          )}
        </div>
      </div>
      {!patient && (
        <div className="referral-toolbar">
          <div className="segmented" aria-label="Referral view">
            <Button
              variant="outline"
              aria-pressed={view === 'inbox'}
              disabled={busy || form !== null}
              onClick={() => {
                if (view === 'inbox') return;
                setView('inbox');
                setSelected(null);
                setLoading(true);
              }}
            >
              My unit inbox
            </Button>
            {provider && (
              <Button
                variant="outline"
                aria-pressed={view === 'sent'}
                disabled={busy || form !== null}
                onClick={() => {
                  if (view === 'sent') return;
                  setView('sent');
                  setSelected(null);
                  setLoading(true);
                }}
              >
                My sent referrals
              </Button>
            )}
          </div>
          <Field label="Referral state" name="referral-scope">
            <select
              id="referral-scope"
              className="clinic-select"
              value={scope}
              disabled={busy || form !== null}
              onChange={(event) => {
                setScope(event.target.value as 'pending' | 'all');
                setSelected(null);
                setLoading(true);
              }}
            >
              <option value="pending">Active referrals</option>
              <option value="all">All referrals</option>
            </select>
          </Field>
        </div>
      )}
      <div role="status" aria-live="polite">
        {notice && <p className="notice success">{notice}</p>}
      </div>
      <ErrorNotice error={error ?? loadError}>
        <Button variant="outline" disabled={loading || busy} onClick={refresh}>
          Refresh referrals
        </Button>
      </ErrorNotice>
      {loadError && referrals && (
        <p className="notice warning">
          Showing last loaded referrals. These records may be out of date.
          Refresh referrals successfully before you change the workflow. Your
          draft input is kept.
        </p>
      )}
      {conflict && (
        <p className="notice warning">
          Your input is kept. Refresh referrals and compare the latest state. If
          the task left the active list, discard your input and select All
          referrals.
        </p>
      )}
      {loading && <Loading>Loading referrals…</Loading>}
      {form === 'create' && patient && (
        <form
          className="panel form-panel"
          onSubmit={(event) => void create(event)}
        >
          <h3>New referral for {patient.fullName}</h3>
          <Field
            label="Receiving unit"
            name="referral-unit"
            error={error}
            errorName="receivingDiscipline"
          >
            <select
              id="referral-unit"
              className="clinic-select"
              value={receiving}
              disabled={busy}
              onChange={(event) => {
                setReceiving(event.target.value as ReferralUnit);
                setLabOrderId('');
              }}
            >
              {Object.entries(units)
                .filter(([key]) => key !== staffUnit)
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </Field>
          <Field
            label="Reason / requested task"
            name="referral-reason"
            hint="The receiving unit can read this request. Include only the context needed for the task."
            error={error}
            errorName="reason"
          >
            <Textarea
              id="referral-reason"
              required
              maxLength={4000}
              value={reason}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {receiving === 'laboratory' && (
            <div className="referral-lab-link">
              <h4>Link an existing laboratory order</h4>
              <p className="hint">
                Laboratory orders contain the requested tests. Create the order
                under Laboratory orders before you send this referral.
              </p>
              <ErrorNotice error={labError} />
              {labs === null && !labError && (
                <Loading>Loading laboratory orders…</Loading>
              )}
              {labs !== null && availableOrders.length === 0 && (
                <p className="notice">
                  No active laboratory orders owned by you are available for
                  this patient. Create one, then refresh this list.
                </p>
              )}
              <Field
                label="Laboratory order"
                name="referral-lab-order"
                error={error}
                errorName="labOrderId"
              >
                <select
                  id="referral-lab-order"
                  className="clinic-select"
                  required
                  value={labOrderId}
                  disabled={busy}
                  onChange={(event) => setLabOrderId(event.target.value)}
                >
                  <option value="">Select an active laboratory order</option>
                  {availableOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.requestedTests.join(', ')} ·{' '}
                      {date(order.requestedFor)} · {order.id}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void loadLabs(patient.id)}
              >
                Refresh laboratory orders
              </Button>
            </div>
          )}
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation('discard')}
            >
              Discard referral
            </Button>
            <Button type="submit" disabled={workflowBlocked}>
              {busy ? 'Sending…' : 'Send referral'}
            </Button>
          </div>
        </form>
      )}
      {!loading && referrals?.length === 0 && (
        <Empty>
          {patient
            ? 'No referrals are available for your account for this patient.'
            : scope === 'pending'
              ? 'No active referrals in this view. Refresh to check for new work, or select All referrals to see completed and closed tasks.'
              : 'No referrals in this view. Provider requests will appear here.'}
        </Empty>
      )}
      {referrals && (referrals.length > 0 || selected) && (
        <div className="referral-workspace">
          <section className="panel referral-list" aria-label="Referral list">
            <h3>
              {patient
                ? 'Patient referrals'
                : view === 'inbox'
                  ? 'My unit inbox'
                  : 'My sent referrals'}{' '}
              · {referrals.length}
            </h3>
            <ul>
              {referrals.map((record) => (
                <li key={record.id}>
                  <button
                    className="referral-option"
                    type="button"
                    aria-pressed={selected?.id === record.id}
                    disabled={busy || form !== null}
                    onClick={() => {
                      setSelected(record);
                      setNotice('');
                      clearError();
                    }}
                  >
                    <strong>{record.patient.fullName}</strong>
                    <span>
                      {units[record.originDiscipline]} →{' '}
                      {units[record.receivingDiscipline]}
                    </span>
                    <span className="hint">
                      {record.originStaffName} · {date(record.createdAt)}
                    </span>
                    <span className="badge">{states[record.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {selected ? (
            <article className="panel referral-detail">
              <div className="section-heading">
                <h3>{selected.patient.fullName}</h3>
                <span
                  className={`badge ${selected.status === 'completed' ? 'success' : ''}`}
                >
                  {states[selected.status]}
                </span>
              </div>
              <p className="hint">
                Patient number: {selected.patient.id} · Birth date:{' '}
                {date(selected.patient.dateOfBirth)}
              </p>
              <dl className="clinical-content">
                <div>
                  <dt>From</dt>
                  <dd>
                    {selected.originStaffName} ·{' '}
                    {units[selected.originDiscipline]}
                  </dd>
                </div>
                <div>
                  <dt>Receiving unit</dt>
                  <dd>{units[selected.receivingDiscipline]}</dd>
                </div>
                <div>
                  <dt>Reason / requested task</dt>
                  <dd>{selected.reason}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>
                    {timestamp(selected.createdAt)} · Revision{' '}
                    {selected.revision}
                  </dd>
                </div>
                {selected.acceptedAt && (
                  <div>
                    <dt>Accepted</dt>
                    <dd>
                      {selected.acceptedByName} ·{' '}
                      {timestamp(selected.acceptedAt)}
                    </dd>
                  </div>
                )}
                {selected.startedAt && (
                  <div>
                    <dt>Started</dt>
                    <dd>
                      {selected.startedByName} · {timestamp(selected.startedAt)}
                    </dd>
                  </div>
                )}
                {selected.completedAt && (
                  <div>
                    <dt>Completed</dt>
                    <dd>
                      {selected.completedByName} ·{' '}
                      {timestamp(selected.completedAt)}
                    </dd>
                  </div>
                )}
                {selected.closedAt && (
                  <div>
                    <dt>
                      {selected.status === 'rejected'
                        ? 'Rejection'
                        : 'Cancellation'}
                    </dt>
                    <dd>
                      {selected.closeReason}
                      {`\n${selected.closedByName} · ${timestamp(selected.closedAt)}`}
                    </dd>
                  </div>
                )}
                {selected.labOrder && (
                  <div>
                    <dt>Linked laboratory order</dt>
                    <dd>
                      {selected.labOrder.requestedTests.join(', ')}
                      {`\nOrder number: ${selected.labOrder.id}`}
                    </dd>
                  </div>
                )}
                {selected.completionNote && (
                  <div>
                    <dt>Completion note</dt>
                    <dd>{selected.completionNote}</dd>
                  </div>
                )}
                {selected.completionReference && (
                  <div>
                    <dt>Procedure / document reference</dt>
                    <dd>{selected.completionReference}</dd>
                  </div>
                )}
                {selected.labResult && (
                  <div>
                    <dt>Authoritative laboratory result reference</dt>
                    <dd>
                      {selected.labResult.id}
                      {selected.labResult.finalizedAt
                        ? `\nFinalized ${timestamp(selected.labResult.finalizedAt)}`
                        : ''}
                      {selected.labResult.supersededById
                        ? `\nA later correction exists: ${selected.labResult.supersededById}. Open Laboratory orders for current values.`
                        : '\nOpen Laboratory orders for the saved values.'}
                    </dd>
                  </div>
                )}
              </dl>
              {!form && (
                <div className="referral-actions">
                  {ownsTask && selected.status === 'pending' && (
                    <Button
                      disabled={workflowBlocked}
                      onClick={() =>
                        void perform(
                          () =>
                            api.acceptReferral({
                              id: selected.id,
                              expectedRevision: selected.revision,
                            }),
                          'Referral accepted and assigned to you.',
                        )
                      }
                    >
                      Accept referral
                    </Button>
                  )}
                  {ownsTask && selected.status === 'accepted' && (
                    <Button
                      disabled={workflowBlocked}
                      onClick={() =>
                        void perform(
                          () =>
                            api.startReferral({
                              id: selected.id,
                              expectedRevision: selected.revision,
                            }),
                          'Referral task started.',
                        )
                      }
                    >
                      Start referral task
                    </Button>
                  )}
                  {ownsTask && selected.status === 'in_progress' && (
                    <Button
                      disabled={workflowBlocked}
                      onClick={() => openForm('complete')}
                    >
                      Complete referral
                    </Button>
                  )}
                  {selected.originStaffId === staff.id && active(selected) && (
                    <Button
                      variant="outline"
                      disabled={workflowBlocked}
                      onClick={() => openForm('cancel')}
                    >
                      Cancel referral
                    </Button>
                  )}
                  {ownsTask && active(selected) && (
                    <Button
                      variant="outline"
                      disabled={workflowBlocked}
                      onClick={() => openForm('reject')}
                    >
                      Reject referral
                    </Button>
                  )}
                </div>
              )}
              {mayReceive &&
                selected.acceptedById &&
                selected.acceptedById !== staff.id &&
                active(selected) && (
                  <p className="hint">
                    Read-only task · {selected.acceptedByName} accepted this
                    referral and must finish or reject it.
                  </p>
                )}
              {form === 'complete' && (
                <form
                  className="referral-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setConfirmation('complete');
                  }}
                >
                  <h3>Complete referral</h3>
                  {selected.receivingDiscipline === 'laboratory' && (
                    <div className="referral-lab-link">
                      <ErrorNotice error={labError} />
                      {labs === null && !labError && (
                        <Loading>Loading finalized result references…</Loading>
                      )}
                      {labs && finalResults.length === 0 && (
                        <p className="notice">
                          No current finalized result is available for this
                          order. Finalize its results under Laboratory orders,
                          then refresh this list.
                        </p>
                      )}
                      <Field
                        label="Finalized laboratory result"
                        name="referral-result"
                        error={error}
                        errorName="labResultId"
                      >
                        <select
                          id="referral-result"
                          className="clinic-select"
                          required
                          value={labResultId}
                          disabled={busy}
                          onChange={(event) =>
                            setLabResultId(event.target.value)
                          }
                        >
                          <option value="">
                            Select the current finalized result
                          </option>
                          {finalResults.map((result) => (
                            <option value={result.id} key={result.id}>
                              {result.authorName} ·{' '}
                              {result.finalizedAt
                                ? timestamp(result.finalizedAt)
                                : 'Finalized'}{' '}
                              · {result.id}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void loadLabs(selected.patientId)}
                      >
                        Refresh laboratory orders
                      </Button>
                    </div>
                  )}
                  <Field
                    label={
                      selected.receivingDiscipline === 'laboratory'
                        ? 'Completion note (optional)'
                        : 'Completion note'
                    }
                    name="referral-completion-note"
                    error={error}
                    errorName="completionNote"
                  >
                    <Textarea
                      id="referral-completion-note"
                      required={selected.receivingDiscipline !== 'laboratory'}
                      maxLength={4000}
                      disabled={busy}
                      value={completionNote}
                      onChange={(event) =>
                        setCompletionNote(event.target.value)
                      }
                    />
                  </Field>
                  {selected.receivingDiscipline !== 'laboratory' && (
                    <Field
                      label="Procedure / document reference (optional)"
                      name="referral-completion-reference"
                      error={error}
                      errorName="completionReference"
                    >
                      <Input
                        id="referral-completion-reference"
                        maxLength={200}
                        disabled={busy}
                        value={completionReference}
                        onChange={(event) =>
                          setCompletionReference(event.target.value)
                        }
                      />
                    </Field>
                  )}
                  <p className="hint">
                    Completion records the staff member and time. This referral
                    cannot be changed after completion.
                  </p>
                  <div className="form-actions">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmation('discard')}
                    >
                      Discard completion
                    </Button>
                    <Button type="submit" disabled={workflowBlocked}>
                      {busy ? 'Saving…' : 'Review completion'}
                    </Button>
                  </div>
                </form>
              )}
              {(form === 'cancel' || form === 'reject') && (
                <form
                  className="referral-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setConfirmation(form);
                  }}
                >
                  <Field
                    label={
                      form === 'cancel'
                        ? 'Cancellation reason'
                        : 'Rejection reason'
                    }
                    name="referral-close-reason"
                    error={error}
                    errorName="reason"
                  >
                    <Textarea
                      id="referral-close-reason"
                      required
                      maxLength={4000}
                      disabled={busy}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field>
                  <div className="form-actions">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmation('discard')}
                    >
                      Keep referral open
                    </Button>
                    <Button
                      type="submit"
                      variant="outline"
                      className="referral-danger"
                      disabled={workflowBlocked}
                    >
                      {form === 'cancel'
                        ? 'Cancel referral'
                        : 'Reject referral'}
                    </Button>
                  </div>
                </form>
              )}
            </article>
          ) : (
            <Empty>
              Select a referral to read its request and available actions.
            </Empty>
          )}
        </div>
      )}
      {confirmation && (
        <Confirm
          title={
            confirmation === 'discard'
              ? 'Discard these changes?'
              : confirmation === 'complete'
                ? 'Complete this referral?'
                : confirmation === 'cancel'
                  ? 'Cancel this referral?'
                  : 'Reject this referral?'
          }
          action={
            confirmation === 'discard'
              ? 'Discard changes'
              : confirmation === 'complete'
                ? 'Confirm completion'
                : confirmation === 'cancel'
                  ? 'Confirm cancellation'
                  : 'Confirm rejection'
          }
          busy={busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void confirm()}
        >
          <p>
            {confirmation === 'discard'
              ? 'Unsaved input will be removed.'
              : confirmation === 'complete'
                ? 'The completion note and result reference will be preserved with your name and the time. The originating provider will see the completed task.'
                : 'The referral and reason remain in history. The provider can create a new referral if more work is needed.'}
          </p>
        </Confirm>
      )}
    </section>
  );
}
