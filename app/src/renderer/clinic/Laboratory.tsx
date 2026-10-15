import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  LabOrder,
  LabOrderStatus,
  LabPriority,
  LabResult,
  LabValue,
} from '../../shared/laboratory-api';
import type { PatientIdentity } from '../../shared/clinic-api';
import type { ClinicError, Principal, Result } from './contract';
import type { LaboratoryApi } from './laboratory-contract';
import { date, timestamp, today } from './format';
import { Confirm, Empty, ErrorNotice, Field, Loading } from './ui';
import { useOperation } from './use-operation';
import './laboratory.css';

const states: Record<LabOrderStatus, string> = {
  ordered: 'Ordered',
  in_progress: 'In progress',
  resulted: 'Ready for review',
  reviewed: 'Reviewed',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};
const emptyValue = (test = ''): LabValue => ({
  test,
  value: '',
  unit: null,
  referenceRange: null,
  flag: 'unspecified',
});

export function Laboratory({
  api,
  staff,
  patient,
  demo = false,
  onExpired,
  onDirty,
}: {
  api: LaboratoryApi;
  staff: Principal;
  patient?: PatientIdentity;
  demo?: boolean;
  onExpired?: () => void;
  onDirty?: (dirty: boolean) => void;
}): ReactElement {
  const [orders, setOrders] = useState<LabOrder[] | null>(null);
  const [loadError, setLoadError] = useState<ClinicError | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'pending' | 'all'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<LabOrder | null>(null);
  const [creating, setCreating] = useState(false);
  const [testNames, setTestNames] = useState('');
  const [clinicalContext, setClinicalContext] = useState('');
  const [priority, setPriority] = useState<LabPriority>('routine');
  const [requestedFor, setRequestedFor] = useState(today);
  const [editor, setEditor] = useState<'draft' | 'correction' | null>(null);
  const [rows, setRows] = useState<LabValue[]>([]);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [closing, setClosing] = useState<'cancel' | 'reject' | null>(null);
  const [confirmation, setConfirmation] = useState<
    'finalize' | 'correction' | 'cancel' | 'reject' | 'discard' | null
  >(null);
  const [notice, setNotice] = useState('');
  const { busy, error, conflict, run, clearError } = useOperation(onExpired);
  const workflowBlocked = busy || conflict || loadError !== null;
  const requestNumber = useRef(0);
  const patientId = patient?.id;
  const provider = staff.role === 'doctor' || staff.role === 'dentist';
  const currentSelection = orders?.find((order) => order.id === selectedId);
  const selected = editingOrder ?? currentSelection;
  const draft = selected?.results.find((result) => result.status === 'draft');
  const latest = selected?.results.find(
    (result) =>
      result.status === 'finalized' &&
      !selected.results.some((next) => next.correctionOfId === result.id),
  );
  const editing = creating || editor !== null || closing !== null;
  const selectionChanged = Boolean(
    editingOrder &&
    orders &&
    (!currentSelection || currentSelection.revision !== editingOrder.revision),
  );
  useEffect(() => {
    onDirty?.(editing);
    return (): void => onDirty?.(false);
  }, [editing, onDirty]);

  const load = useCallback((): Promise<void> => {
    const requestId = ++requestNumber.current;
    const operation = patientId
      ? api.listLabOrders({ patientId })
      : api.listLabQueue({ scope });
    return operation
      .then((result) => {
        if (requestId !== requestNumber.current) return;
        setLoadError(null);
        if (result.ok) {
          setOrders(result.data);
          clearError();
        } else {
          setLoadError(result.error);
          if (result.error.code === 'UNAUTHENTICATED') onExpired?.();
        }
      })
      .catch(() => {
        if (requestId === requestNumber.current)
          setLoadError({
            code: 'UNAVAILABLE',
            message:
              'Laboratory orders are unavailable. Check the clinic connection and select Refresh orders.',
          });
      })
      .finally(() => {
        if (requestId === requestNumber.current) setLoading(false);
      });
  }, [api, patientId, scope, clearError, onExpired]);
  useEffect(() => {
    const requests = requestNumber;
    void load();
    return (): void => {
      requests.current++;
    };
  }, [load]);

  function refresh(): void {
    setLoading(true);
    void load();
  }

  async function perform(
    operation: () => Promise<Result<LabOrder>>,
    message: string,
  ): Promise<boolean> {
    if (loadError) return false;
    const result = await run(operation);
    if (!result) return false;
    const leftQueue =
      !patientId &&
      scope === 'pending' &&
      !['ordered', 'in_progress'].includes(result.status);
    setOrders((current) => [
      ...(leftQueue ? [] : [result]),
      ...(current ?? []).filter((order) => order.id !== result.id),
    ]);
    setSelectedId(leftQueue ? null : result.id);
    setNotice(
      demo
        ? `${message} Demo changes remain in memory.`
        : `${message} Saved on the clinic server.`,
    );
    setEditor(null);
    setEditingOrder(null);
    setCreating(false);
    setClosing(null);
    setConfirmation(null);
    return true;
  }
  function beginResult(correction: boolean): void {
    if (!selected) return;
    setEditingOrder(structuredClone(selected));
    const content = correction ? latest : draft;
    setRows(
      content
        ? structuredClone(content.values)
        : selected.requestedTests.map((test) => emptyValue(test)),
    );
    setNotes(content?.notes ?? '');
    setReason('');
    setEditor(correction ? 'correction' : 'draft');
    clearError();
    setNotice('');
  }
  async function createOrder(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!patient) return;
    const saved = await perform(
      () =>
        api.createLabOrder({
          patientId: patient.id,
          requestedTests: testNames
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean),
          clinicalContext: clinicalContext.trim() || null,
          priority,
          requestedFor,
        }),
      'Laboratory order created.',
    );
    if (saved) {
      setTestNames('');
      setClinicalContext('');
    }
  }
  async function saveResult(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selected) return;
    if (selectionChanged) return;
    if (editor === 'correction') {
      setConfirmation('correction');
      return;
    }
    await perform(
      () =>
        api.saveLabResult({
          orderId: selected.id,
          expectedRevision: selected.revision,
          values: rows,
          notes: notes.trim() || null,
        }),
      'Laboratory result draft saved.',
    );
  }
  async function confirm(): Promise<void> {
    if (confirmation === 'discard') {
      setCreating(false);
      setEditor(null);
      setEditingOrder(null);
      setClosing(null);
      setConfirmation(null);
      clearError();
      return;
    }
    if (!selected) return;
    if (selectionChanged || loadError) {
      setConfirmation(null);
      return;
    }
    if (confirmation === 'finalize' && draft)
      await perform(
        () =>
          api.finalizeLabResult({
            id: draft.id,
            expectedRevision: draft.revision,
            expectedOrderRevision: selected.revision,
          }),
        'Laboratory result finalized for provider review.',
      );
    if (confirmation === 'correction' && latest)
      await perform(
        () =>
          api.correctLabResult({
            id: latest.id,
            expectedRevision: latest.revision,
            expectedOrderRevision: selected.revision,
            reason,
            values: rows,
            notes: notes.trim() || null,
          }),
        'Correction finalized. The provider must review it again.',
      );
    if (confirmation === 'cancel' || confirmation === 'reject') {
      const input = {
        id: selected.id,
        expectedRevision: selected.revision,
        reason,
      };
      await perform(
        () =>
          confirmation === 'cancel'
            ? api.cancelLabOrder(input)
            : api.rejectLabOrder(input),
        confirmation === 'cancel'
          ? 'Laboratory order cancelled.'
          : 'Laboratory order rejected.',
      );
    }
    setConfirmation(null);
  }
  function changeRow(index: number, change: Partial<LabValue>): void {
    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, ...change } : row,
      ),
    );
  }

  if (!['doctor', 'dentist', 'medtech'].includes(staff.role))
    return <Empty>Your account cannot access laboratory orders.</Empty>;
  if (!patient && staff.role !== 'medtech')
    return (
      <Empty>
        Open a patient from the registry to view or create laboratory orders.
      </Empty>
    );
  return (
    <section
      className="laboratory"
      aria-label={
        patient ? 'Patient laboratory orders' : 'Laboratory work queue'
      }
    >
      <div className="page-heading">
        <div>
          <h2>{patient ? 'Laboratory orders' : 'Laboratory work queue'}</h2>
          <p className="hint">
            {patient
              ? patient.fullName
              : 'Patient identity and laboratory order context only.'}
          </p>
        </div>
        <div className="lab-actions">
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={refresh}
          >
            Refresh orders
          </Button>
          {provider && patient && (
            <Button
              disabled={busy || editing || loadError !== null}
              onClick={() => {
                setCreating(true);
                setNotice('');
                clearError();
              }}
            >
              New laboratory order
            </Button>
          )}
        </div>
      </div>
      {!patient && (
        <Field label="Queue view" name="lab-queue-scope">
          <select
            id="lab-queue-scope"
            className="clinic-select"
            value={scope}
            disabled={busy || editing}
            onChange={(event) => {
              setLoading(true);
              setScope(event.target.value as 'pending' | 'all');
              setSelectedId(null);
            }}
          >
            <option value="pending">Pending work</option>
            <option value="all">All laboratory orders</option>
          </select>
        </Field>
      )}
      <div role="status" aria-live="polite">
        {notice && <p className="notice success">{notice}</p>}
      </div>
      <ErrorNotice error={error ?? loadError}>
        <Button variant="outline" disabled={loading || busy} onClick={refresh}>
          Refresh orders
        </Button>
      </ErrorNotice>
      {loadError && orders && (
        <p className="notice warning">
          Showing last loaded laboratory orders. These records may be out of
          date. Refresh orders successfully before you change the workflow. Your
          draft input is kept.
        </p>
      )}
      {conflict && (
        <p className="notice warning">
          Keep your input. Refresh orders to check the current record. If it
          changed, copy any needed input, discard this edit, and reopen the
          current order.
        </p>
      )}
      {selectionChanged && editingOrder && (
        <div className="notice warning" role="alert">
          <p>
            {currentSelection
              ? 'This order changed on the clinic server.'
              : 'This order is no longer in the current queue. Another staff member may have completed or closed it.'}{' '}
            Your input is kept with revision {editingOrder.revision}. Copy any
            needed input before you discard this edit and reopen the current
            order. A newer revision will not replace your draft.
          </p>
          <div className="lab-actions">
            {!patientId && scope === 'pending' && !currentSelection && (
              <Button
                variant="outline"
                disabled={busy || loading}
                onClick={() => {
                  setLoading(true);
                  setScope('all');
                }}
              >
                Switch to all orders
              </Button>
            )}
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation('discard')}
            >
              Discard input
            </Button>
          </div>
        </div>
      )}
      {loading && <Loading>Loading laboratory orders…</Loading>}
      {creating && patient && (
        <form
          className="panel form-panel"
          onSubmit={(event) => void createOrder(event)}
        >
          <h3>New laboratory order for {patient.fullName}</h3>
          <Field
            label="Requested tests"
            name="lab-tests"
            hint="Enter one test or panel per line. Up to 50 tests."
            error={error}
            errorName="requestedTests"
          >
            <Textarea
              id="lab-tests"
              required
              maxLength={10049}
              disabled={busy}
              value={testNames}
              onChange={(event) => setTestNames(event.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field
              label="Requested date"
              name="lab-requested-for"
              error={error}
              errorName="requestedFor"
            >
              <Input
                id="lab-requested-for"
                type="date"
                required
                disabled={busy}
                value={requestedFor}
                onChange={(event) => setRequestedFor(event.target.value)}
              />
            </Field>
            <Field label="Priority" name="lab-priority">
              <select
                id="lab-priority"
                className="clinic-select"
                value={priority}
                disabled={busy}
                onChange={(event) =>
                  setPriority(event.target.value as LabPriority)
                }
              >
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
              </select>
            </Field>
          </div>
          <Field
            label="Laboratory clinical context (optional)"
            name="lab-context"
            hint="This text is shared with the laboratory. Include only information needed for the tests."
            error={error}
            errorName="clinicalContext"
          >
            <Textarea
              id="lab-context"
              maxLength={4000}
              disabled={busy}
              value={clinicalContext}
              onChange={(event) => setClinicalContext(event.target.value)}
            />
          </Field>
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmation('discard')}
            >
              Discard order
            </Button>
            <Button type="submit" disabled={workflowBlocked}>
              {busy ? 'Saving…' : 'Create laboratory order'}
            </Button>
          </div>
        </form>
      )}
      {!loading && orders?.length === 0 && !selected && (
        <Empty>
          {patient
            ? 'No laboratory orders for this patient. The provider can create an order here.'
            : scope === 'pending'
              ? 'No pending laboratory work. Refresh orders to check for new requests, or select All laboratory orders to review completed work.'
              : 'No laboratory orders. Provider orders will appear here.'}
        </Empty>
      )}
      {orders && (orders.length > 0 || selected) && (
        <div className="lab-workspace">
          <section
            className="panel lab-order-list"
            aria-label="Laboratory order list"
          >
            <h3>
              {patient ? 'Patient orders' : 'Orders'} · {orders.length}
            </h3>
            <ul>
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    className="lab-order-option"
                    aria-pressed={selectedId === order.id}
                    disabled={busy || editing}
                    onClick={() => {
                      setSelectedId(order.id);
                      setNotice('');
                      clearError();
                    }}
                  >
                    <strong>
                      {patient
                        ? order.requestedTests.join(', ')
                        : order.patient.fullName}
                    </strong>
                    <span>
                      {patient
                        ? order.orderingProviderName
                        : order.requestedTests.join(', ')}
                    </span>
                    <span className="hint">
                      {date(order.requestedFor)} ·{' '}
                      {order.priority === 'urgent' ? 'Urgent' : 'Routine'}
                    </span>
                    <span className="badge">{states[order.status]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {selected ? (
            <article className="panel lab-order-detail">
              <div className="section-heading">
                <h3>{selected.patient.fullName}</h3>
                <span
                  className={`badge ${selected.status === 'reviewed' ? 'success' : selected.status === 'resulted' ? 'warning' : ''}`}
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
                  <dt>Requested tests</dt>
                  <dd>{selected.requestedTests.join(', ')}</dd>
                </div>
                <div>
                  <dt>Ordering provider</dt>
                  <dd>
                    {selected.orderingProviderName} ·{' '}
                    {selected.discipline === 'medical' ? 'Medical' : 'Dental'}
                  </dd>
                </div>
                <div>
                  <dt>Requested date / priority</dt>
                  <dd>
                    {date(selected.requestedFor)} ·{' '}
                    {selected.priority === 'urgent' ? 'Urgent' : 'Routine'}
                  </dd>
                </div>
                <div>
                  <dt>Laboratory clinical context</dt>
                  <dd>{selected.clinicalContext || 'No context supplied'}</dd>
                </div>
                <div>
                  <dt>Order history</dt>
                  <dd>
                    Created {timestamp(selected.createdAt)} · Revision{' '}
                    {selected.revision}
                    {selected.startedAt
                      ? `\nStarted ${timestamp(selected.startedAt)}`
                      : ''}
                    {selected.reviewedAt
                      ? `\nReviewed ${timestamp(selected.reviewedAt)}`
                      : ''}
                  </dd>
                </div>
                {selected.closeReason && (
                  <div>
                    <dt>
                      {selected.status === 'rejected'
                        ? 'Rejection reason'
                        : 'Cancellation reason'}
                    </dt>
                    <dd>
                      {selected.closeReason}
                      {selected.closedAt
                        ? `\n${timestamp(selected.closedAt)}`
                        : ''}
                    </dd>
                  </div>
                )}
              </dl>
              {!editing && (
                <div className="lab-actions">
                  {staff.role === 'medtech' &&
                    selected.status === 'ordered' && (
                      <Button
                        disabled={workflowBlocked}
                        onClick={() =>
                          void perform(
                            () =>
                              api.startLabOrder({
                                id: selected.id,
                                expectedRevision: selected.revision,
                              }),
                            'Laboratory work started.',
                          )
                        }
                      >
                        Start laboratory work
                      </Button>
                    )}
                  {staff.role === 'medtech' &&
                    selected.status === 'in_progress' &&
                    (!draft || draft.authorId === staff.id) && (
                      <Button
                        disabled={workflowBlocked}
                        onClick={() => beginResult(false)}
                      >
                        {draft
                          ? 'Edit result draft'
                          : 'Enter laboratory result'}
                      </Button>
                    )}
                  {staff.role === 'medtech' &&
                    draft?.authorId === staff.id &&
                    selected.status === 'in_progress' && (
                      <Button
                        variant="outline"
                        disabled={workflowBlocked}
                        onClick={() => setConfirmation('finalize')}
                      >
                        Finalize laboratory result
                      </Button>
                    )}
                  {staff.role === 'medtech' &&
                    latest?.authorId === staff.id &&
                    ['resulted', 'reviewed'].includes(selected.status) && (
                      <Button
                        variant="outline"
                        disabled={workflowBlocked}
                        onClick={() => beginResult(true)}
                      >
                        Add result correction
                      </Button>
                    )}
                  {provider &&
                    selected.orderingProviderId === staff.id &&
                    selected.status === 'resulted' && (
                      <Button
                        disabled={workflowBlocked}
                        onClick={() =>
                          void perform(
                            () =>
                              api.reviewLabOrder({
                                id: selected.id,
                                expectedRevision: selected.revision,
                              }),
                            'Laboratory result marked reviewed.',
                          )
                        }
                      >
                        Mark results reviewed
                      </Button>
                    )}
                  {['ordered', 'in_progress'].includes(selected.status) &&
                    ((provider && selected.orderingProviderId === staff.id) ||
                      staff.role === 'medtech') && (
                      <Button
                        variant="outline"
                        disabled={workflowBlocked}
                        onClick={() => {
                          setEditingOrder(structuredClone(selected));
                          setClosing(
                            staff.role === 'medtech' ? 'reject' : 'cancel',
                          );
                          setReason('');
                        }}
                      >
                        {staff.role === 'medtech'
                          ? 'Reject laboratory order'
                          : 'Cancel laboratory order'}
                      </Button>
                    )}
                </div>
              )}
              {draft &&
                draft.authorId !== staff.id &&
                staff.role === 'medtech' && (
                  <p className="hint">
                    Read-only draft · Only {draft.authorName} can change or
                    finalize this result.
                  </p>
                )}
              {provider && selected.orderingProviderId !== staff.id && (
                <p className="hint">
                  Read-only order · Only the ordering provider can cancel the
                  order or mark results reviewed.
                </p>
              )}
              {provider &&
                ['ordered', 'in_progress'].includes(selected.status) && (
                  <p className="hint">
                    Results appear here after the laboratory finalizes them.
                  </p>
                )}
              {closing && (
                <form
                  className="lab-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setConfirmation(closing);
                  }}
                >
                  <Field
                    label={
                      closing === 'reject'
                        ? 'Rejection reason'
                        : 'Cancellation reason'
                    }
                    name="lab-close-reason"
                    error={error}
                    errorName="reason"
                  >
                    <Textarea
                      id="lab-close-reason"
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
                      Keep order open
                    </Button>
                    <Button
                      type="submit"
                      variant="outline"
                      className="lab-danger"
                      disabled={workflowBlocked || selectionChanged}
                    >
                      {closing === 'reject'
                        ? 'Reject laboratory order'
                        : 'Cancel laboratory order'}
                    </Button>
                  </div>
                </form>
              )}
              {editor && (
                <form
                  className="lab-editor"
                  onSubmit={(event) => void saveResult(event)}
                >
                  <h3>
                    {editor === 'correction'
                      ? 'Correct the latest finalized result'
                      : 'Laboratory result draft'}
                  </h3>
                  <p className="hint">
                    Results are text values with a unit, reference range, and
                    flag. Confirm the values before finalization.
                  </p>
                  {error?.fieldErrors?.values && (
                    <p className="field-error" role="alert">
                      Check the test names and values. Use a different name for
                      each test.
                    </p>
                  )}
                  {rows.map((row, index) => (
                    <fieldset className="lab-value-fields" key={index}>
                      <legend>Result {index + 1}</legend>
                      <div className="form-grid">
                        <Field
                          label="Test / analyte"
                          name={`lab-test-${index}`}
                        >
                          <Input
                            id={`lab-test-${index}`}
                            required
                            maxLength={200}
                            disabled={busy}
                            value={row.test}
                            onChange={(event) =>
                              changeRow(index, { test: event.target.value })
                            }
                          />
                        </Field>
                        <Field label="Result value" name={`lab-value-${index}`}>
                          <Input
                            id={`lab-value-${index}`}
                            required
                            maxLength={1000}
                            disabled={busy}
                            value={row.value}
                            onChange={(event) =>
                              changeRow(index, { value: event.target.value })
                            }
                          />
                        </Field>
                        <Field
                          label="Unit (optional)"
                          name={`lab-unit-${index}`}
                        >
                          <Input
                            id={`lab-unit-${index}`}
                            maxLength={100}
                            disabled={busy}
                            value={row.unit ?? ''}
                            onChange={(event) =>
                              changeRow(index, {
                                unit: event.target.value || null,
                              })
                            }
                          />
                        </Field>
                        <Field
                          label="Reference range (optional)"
                          name={`lab-range-${index}`}
                        >
                          <Input
                            id={`lab-range-${index}`}
                            maxLength={200}
                            disabled={busy}
                            value={row.referenceRange ?? ''}
                            onChange={(event) =>
                              changeRow(index, {
                                referenceRange: event.target.value || null,
                              })
                            }
                          />
                        </Field>
                        <Field label="Result flag" name={`lab-flag-${index}`}>
                          <select
                            id={`lab-flag-${index}`}
                            className="clinic-select"
                            disabled={busy}
                            value={row.flag}
                            onChange={(event) =>
                              changeRow(index, {
                                flag: event.target.value as LabValue['flag'],
                              })
                            }
                          >
                            <option value="unspecified">Not specified</option>
                            <option value="normal">Normal</option>
                            <option value="abnormal">Abnormal</option>
                            <option value="critical">Critical</option>
                          </select>
                        </Field>
                      </div>
                      {rows.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            setRows((current) =>
                              current.filter(
                                (_, position) => position !== index,
                              ),
                            )
                          }
                        >
                          Remove result {index + 1}
                        </Button>
                      )}
                    </fieldset>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || rows.length >= 100}
                    onClick={() =>
                      setRows((current) => [...current, emptyValue()])
                    }
                  >
                    Add test value
                  </Button>
                  <Field
                    label="Laboratory notes (optional)"
                    name="lab-result-notes"
                  >
                    <Textarea
                      id="lab-result-notes"
                      maxLength={4000}
                      disabled={busy}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                    />
                  </Field>
                  {editor === 'correction' && (
                    <Field
                      label="Correction reason"
                      name="lab-correction-reason"
                      error={error}
                      errorName="reason"
                    >
                      <Textarea
                        id="lab-correction-reason"
                        required
                        maxLength={4000}
                        disabled={busy}
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                      />
                    </Field>
                  )}
                  <div className="form-actions">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmation('discard')}
                    >
                      Discard result changes
                    </Button>
                    <Button
                      type="submit"
                      disabled={workflowBlocked || selectionChanged}
                    >
                      {busy
                        ? 'Saving…'
                        : editor === 'correction'
                          ? 'Review correction'
                          : 'Save result draft'}
                    </Button>
                  </div>
                </form>
              )}
              {selected.results.length > 0 && (
                <section
                  className="lab-result-history"
                  aria-label="Laboratory result history"
                >
                  <h3>Results and correction history</h3>
                  {selected.results.map((result) => (
                    <ResultRecord
                      key={result.id}
                      result={result}
                      current={result.id === latest?.id}
                    />
                  ))}
                </section>
              )}
            </article>
          ) : (
            <Empty>
              Select an order to see its tests, status, and available actions.
            </Empty>
          )}
        </div>
      )}
      {confirmation && (
        <Confirm
          title={
            confirmation === 'discard'
              ? 'Discard these changes?'
              : confirmation === 'finalize'
                ? 'Finalize this laboratory result?'
                : confirmation === 'correction'
                  ? 'Finalize this correction?'
                  : confirmation === 'reject'
                    ? 'Reject this laboratory order?'
                    : 'Cancel this laboratory order?'
          }
          action={
            confirmation === 'discard'
              ? 'Discard changes'
              : confirmation === 'finalize'
                ? 'Confirm finalization'
                : confirmation === 'correction'
                  ? 'Finalize correction'
                  : confirmation === 'reject'
                    ? 'Confirm rejection'
                    : 'Confirm cancellation'
          }
          busy={busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void confirm()}
        >
          <p>
            {confirmation === 'discard'
              ? 'Unsaved input will be removed.'
              : confirmation === 'correction'
                ? 'The previous result stays unchanged. This correction will require provider review.'
                : confirmation === 'finalize'
                  ? 'Finalized values stay unchanged. Later changes require a correction.'
                  : 'The reason and order will remain in history. Create a new order if tests are needed again.'}
          </p>
        </Confirm>
      )}
    </section>
  );
}

function ResultRecord({
  result,
  current,
}: {
  result: LabResult;
  current: boolean;
}): ReactElement {
  return (
    <section className="lab-result-record">
      <div className="section-heading">
        <h4>
          {result.status === 'draft'
            ? 'Draft result'
            : result.correctionOfId
              ? 'Finalized correction'
              : 'Original finalized result'}
          {current ? ' · Current' : ''}
        </h4>
        <span
          className={`badge ${result.status === 'finalized' ? 'success' : 'warning'}`}
        >
          {result.status === 'draft' ? 'Draft' : 'Finalized'}
        </span>
      </div>
      <p className="hint">
        {result.authorName} ·{' '}
        {timestamp(result.finalizedAt ?? result.updatedAt)} · Revision{' '}
        {result.revision}
      </p>
      {result.correctionReason && (
        <p>Correction reason: {result.correctionReason}</p>
      )}
      <p className="hint">
        Result number: {result.id}
        {result.correctionOfId ? ` · Corrects ${result.correctionOfId}` : ''}
      </p>
      <p className="hint">
        In narrow windows, scroll the result table to see all columns.
      </p>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${result.status === 'draft' ? 'Draft' : 'Finalized'} laboratory values`}
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Result</th>
              <th scope="col">Unit</th>
              <th scope="col">Reference range</th>
              <th scope="col">Flag</th>
            </tr>
          </thead>
          <tbody>
            {result.values.map((row) => (
              <tr key={row.test}>
                <th scope="row">{row.test}</th>
                <td>{row.value}</td>
                <td>{row.unit || '—'}</td>
                <td>{row.referenceRange || 'Not supplied'}</td>
                <td>
                  {row.flag === 'unspecified'
                    ? 'Not specified'
                    : row.flag === 'critical'
                      ? 'Critical'
                      : row.flag === 'abnormal'
                        ? 'Abnormal'
                        : 'Normal'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.notes && <p className="lab-result-notes">{result.notes}</p>}
    </section>
  );
}
