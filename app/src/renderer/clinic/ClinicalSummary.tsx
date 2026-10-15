import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Result, Staff } from '../../shared/clinic-api';
import type {
  ClinicalSummary as Summary,
  ClinicalSummaryApi,
  SummaryContent,
  SummaryFields,
  SummaryHistory,
  SummaryItem,
} from '../../shared/clinical-summary';
import { canReadClinicalSummary } from '../../shared/clinical-summary';
import { Field, Loading } from './ui';
import { date, timestamp } from './format';
import './clinical-summary.css';

type Failure = Extract<Result<unknown>, { ok: false }>['error'];
type Kind = SummaryContent['kind'];
type Edit = {
  mode: 'create' | 'update' | 'correct' | 'inactivate';
  kind: Kind;
  item?: SummaryItem;
};
type ContentField = {
  key: string;
  label: string;
  type?: 'date';
  required?: boolean;
  max?: number;
};
const sections: {
  kind: Kind;
  title: string;
  singular: string;
  empty: string;
}[] = [
  {
    kind: 'allergy',
    title: 'Allergies',
    singular: 'allergy',
    empty:
      'No allergies recorded. This does not confirm that the patient has no known allergies.',
  },
  {
    kind: 'medication',
    title: 'Medications',
    singular: 'medication',
    empty:
      'No medications recorded. Confirm current medicines with the patient.',
  },
  {
    kind: 'condition',
    title: 'Conditions / problem list',
    singular: 'condition',
    empty: 'No chronic conditions or problems recorded.',
  },
  {
    kind: 'immunization',
    title: 'Immunizations',
    singular: 'immunization',
    empty:
      'No immunizations recorded. Confirm the patient’s vaccination record.',
  },
];
const contentFields: Record<Kind, ContentField[]> = {
  allergy: [
    { key: 'substance', label: 'Substance', required: true, max: 200 },
    { key: 'reaction', label: 'Reaction', max: 2000 },
    { key: 'onsetDate', label: 'Onset date', type: 'date' },
  ],
  medication: [
    { key: 'name', label: 'Medication', required: true, max: 200 },
    { key: 'dose', label: 'Dose', max: 200 },
    { key: 'route', label: 'Route', max: 200 },
    { key: 'frequency', label: 'Frequency', max: 500 },
    { key: 'startDate', label: 'Start date', type: 'date' },
    { key: 'endDate', label: 'End date', type: 'date' },
  ],
  condition: [
    { key: 'name', label: 'Condition / problem', required: true, max: 200 },
    { key: 'code', label: 'Code (if known)', max: 100 },
    { key: 'onsetDate', label: 'Onset date', type: 'date' },
    { key: 'resolvedDate', label: 'Resolved date', type: 'date' },
  ],
  immunization: [
    { key: 'name', label: 'Vaccine', required: true, max: 200 },
    {
      key: 'administeredOn',
      label: 'Date administered',
      type: 'date',
      required: true,
    },
    { key: 'lotNumber', label: 'Lot number', max: 200 },
    { key: 'nextDueOn', label: 'Next due date', type: 'date' },
  ],
};
function contentName(content: SummaryContent): string {
  return content.kind === 'allergy' ? content.substance : content.name;
}
function contentFromForm(kind: Kind, data: FormData): SummaryContent {
  const required = (key: string): string => String(data.get(key) ?? '').trim();
  const value = (key: string): string | null => required(key) || null;
  switch (kind) {
    case 'allergy':
      return {
        kind,
        substance: required('substance'),
        reaction: value('reaction'),
        severity: required('severity') as Extract<
          SummaryContent,
          { kind: 'allergy' }
        >['severity'],
        onsetDate: value('onsetDate'),
      };
    case 'medication':
      return {
        kind,
        name: required('name'),
        dose: value('dose'),
        route: value('route'),
        frequency: value('frequency'),
        startDate: value('startDate'),
        endDate: value('endDate'),
      };
    case 'condition':
      return {
        kind,
        name: required('name'),
        code: value('code'),
        onsetDate: value('onsetDate'),
        resolvedDate: value('resolvedDate'),
      };
    case 'immunization':
      return {
        kind,
        name: required('name'),
        administeredOn: required('administeredOn'),
        lotNumber: value('lotNumber'),
        nextDueOn: value('nextDueOn'),
      };
  }
}
function ContentDetails({ fields }: { fields: SummaryFields }): ReactElement {
  const content = fields.content;
  const values = content as unknown as Record<string, string | null>;
  return (
    <dl className="clinical-content summary-details">
      {contentFields[content.kind]
        .filter(
          (field) =>
            field.key !== 'name' &&
            field.key !== 'substance' &&
            values[field.key],
        )
        .map((field) => (
          <div key={field.key}>
            <dt>{field.label}</dt>
            <dd>
              {field.type === 'date'
                ? date(values[field.key]!)
                : values[field.key]}
            </dd>
          </div>
        ))}
      {content.kind === 'allergy' && (
        <div>
          <dt>Severity</dt>
          <dd>
            {content.severity === 'unknown' ? 'Not recorded' : content.severity}
          </dd>
        </div>
      )}
      <div>
        <dt>Source</dt>
        <dd>{fields.source}</dd>
      </div>
      {fields.notes && (
        <div>
          <dt>Notes</dt>
          <dd>{fields.notes}</dd>
        </div>
      )}
    </dl>
  );
}
function FailureNotice({
  error,
  retry,
}: {
  error: Failure | null;
  retry?: () => void;
}): ReactElement | null {
  return error ? (
    <div className="notice error" role="alert">
      <p>{error.message}</p>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Reload clinical summary
        </Button>
      )}
    </div>
  ) : null;
}
const unavailable: Failure = {
  code: 'UNAVAILABLE',
  message:
    'The clinical summary could not be loaded. Check the clinic connection and try again.',
};

interface ClinicalSummaryProps {
  api: ClinicalSummaryApi;
  staff: Staff;
  patientId: string;
  patientName: string;
  onExpired: () => void;
  onDirty?: (dirty: boolean) => void;
  demo?: boolean;
}
export function ClinicalSummary(props: ClinicalSummaryProps): ReactElement {
  return (
    <ClinicalSummaryPanel
      key={`${props.patientId}-${props.staff.id}`}
      {...props}
    />
  );
}
function ClinicalSummaryPanel({
  api,
  staff,
  patientId,
  patientName,
  onExpired,
  onDirty,
  demo = false,
}: ClinicalSummaryProps): ReactElement | null {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadError, setLoadError] = useState<Failure | null>(null);
  const [saveError, setSaveError] = useState<Failure | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0);
  const saving = useRef(false);
  const mounted = useRef(true);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!canReadClinicalSummary(staff)) return;
    let active = true;
    void api
      .readClinicalSummary({ patientId })
      .then((result) => {
        if (!active) return;
        if (result.ok) setSummary(result.data);
        else {
          setLoadError(result.error);
          if (
            result.error.code === 'UNAUTHENTICATED' ||
            result.error.code === 'SESSION_CHANGED'
          )
            onExpired();
        }
      })
      .catch(() => {
        if (active) setLoadError(unavailable);
      });
    return (): void => {
      active = false;
    };
  }, [api, patientId, staff, refresh, onExpired]);
  if (!canReadClinicalSummary(staff)) return null;

  function reload(): void {
    setSummary(null);
    setLoadError(null);
    setRefresh((value) => value + 1);
  }
  function open(next: Edit): void {
    setEdit(next);
    setSaveError(null);
    setNotice('');
    onDirty?.(true);
  }
  function close(): void {
    setEdit(null);
    setSaveError(null);
    onDirty?.(false);
  }
  async function save(data: FormData): Promise<void> {
    if (!edit || saving.current) return;
    saving.current = true;
    setBusy(true);
    setSaveError(null);
    const reason = String(data.get('reason') ?? '').trim();
    const fields: SummaryFields = {
      content: contentFromForm(edit.kind, data),
      source: String(data.get('source') ?? '').trim(),
      notes: String(data.get('notes') ?? '').trim() || null,
    };
    try {
      let result: Result<SummaryItem>;
      if (edit.mode === 'create')
        result = await api.createSummaryItem({ patientId, ...fields });
      else if (edit.item) {
        const revision = {
          id: edit.item.id,
          expectedRevision: edit.item.revision,
          reason,
        };
        result =
          edit.mode === 'inactivate'
            ? await api.inactivateSummaryItem(revision)
            : edit.mode === 'correct'
              ? await api.correctSummaryItem({ ...revision, ...fields })
              : await api.updateSummaryItem({ ...revision, ...fields });
      } else return;
      if (!mounted.current) return;
      if (result.ok) {
        setSummary((previous) =>
          previous
            ? {
                ...previous,
                items: [
                  result.data,
                  ...previous.items.filter(
                    (item) => item.id !== result.data.id,
                  ),
                ],
              }
            : previous,
        );
        setNotice(
          demo
            ? 'Clinical summary saved in this synthetic demo.'
            : 'Clinical summary saved on the clinic server.',
        );
        close();
      } else {
        setSaveError(result.error);
        if (
          result.error.code === 'UNAUTHENTICATED' ||
          result.error.code === 'SESSION_CHANGED'
        )
          onExpired();
        requestAnimationFrame(() =>
          form.current
            ?.querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus(),
        );
      }
    } catch {
      if (mounted.current)
        setSaveError({
          ...unavailable,
          message:
            'The save was not confirmed. Keep your input, check the clinic connection, and try again.',
        });
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const currentFields = edit?.item?.content as unknown as
    Record<string, string | null> | undefined;
  const fieldError = saveError
    ? {
        code: 'VALIDATION' as const,
        message: saveError.message,
        fieldErrors: saveError.fieldErrors,
      }
    : null;
  return (
    <section
      className="panel clinical-summary"
      aria-labelledby="clinical-summary-title"
    >
      <div className="section-heading">
        <h2 id="clinical-summary-title">Clinical summary</h2>
        <Button
          variant="outline"
          disabled={busy || Boolean(edit)}
          onClick={reload}
        >
          Refresh summary
        </Button>
      </div>
      <p className="hint">
        {patientName} · Allergies, medicines, conditions, and immunizations
      </p>
      <p role="status" className={notice ? 'notice success' : undefined}>
        {notice}
      </p>
      <FailureNotice error={loadError} retry={reload} />
      {!summary && !loadError && <Loading>Loading clinical summary…</Loading>}
      {edit && (
        <form
          ref={form}
          key={`${edit.mode}-${edit.item?.id ?? edit.kind}`}
          className="summary-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void save(new FormData(event.currentTarget));
          }}
        >
          <h3>
            {edit.mode === 'create'
              ? 'Add'
              : edit.mode === 'correct'
                ? 'Correct'
                : edit.mode === 'inactivate'
                  ? 'Inactivate'
                  : 'Update'}{' '}
            {sections.find((section) => section.kind === edit.kind)?.singular}
            {edit.item ? `: ${contentName(edit.item.content)}` : ''}
          </h3>
          <p className="hint">
            {patientName} ·{' '}
            {edit.mode === 'create'
              ? 'Record the source of this clinical information.'
              : `Revision ${edit.item?.revision}. Earlier content and its author will be preserved.`}
          </p>
          <FailureNotice error={saveError} />
          {saveError?.code === 'CONFLICT' && (
            <p className="notice warning">
              Your input remains below. Copy any needed text, cancel this edit,
              then refresh the summary before you retry.
            </p>
          )}
          <fieldset disabled={busy} className="summary-fieldset">
            {edit.mode !== 'inactivate' && (
              <>
                <div className="form-grid">
                  {contentFields[edit.kind].map((field, index) => (
                    <Field
                      key={field.key}
                      label={field.label}
                      name={`summary-${field.key}`}
                      error={fieldError}
                      errorName={field.key}
                    >
                      <Input
                        id={`summary-${field.key}`}
                        name={field.key}
                        type={field.type ?? 'text'}
                        required={field.required}
                        maxLength={field.max}
                        defaultValue={currentFields?.[field.key] ?? ''}
                        autoFocus={index === 0}
                      />
                    </Field>
                  ))}
                  {edit.kind === 'allergy' && (
                    <Field label="Severity" name="summary-severity">
                      <select
                        id="summary-severity"
                        name="severity"
                        defaultValue={currentFields?.severity ?? 'unknown'}
                      >
                        <option value="unknown">Not recorded</option>
                        <option value="mild">Mild</option>
                        <option value="moderate">Moderate</option>
                        <option value="severe">Severe</option>
                      </select>
                    </Field>
                  )}
                </div>
                <Field
                  label="Source"
                  name="summary-source"
                  error={fieldError}
                  errorName="source"
                  hint="For example: patient report, prior clinic record, or vaccine card."
                >
                  <Input
                    id="summary-source"
                    name="source"
                    required
                    maxLength={1000}
                    defaultValue={edit.item?.source ?? ''}
                  />
                </Field>
                <Field
                  label="Notes (optional)"
                  name="summary-notes"
                  error={fieldError}
                  errorName="notes"
                >
                  <Textarea
                    id="summary-notes"
                    name="notes"
                    maxLength={4000}
                    defaultValue={edit.item?.notes ?? ''}
                  />
                </Field>
              </>
            )}
            {edit.mode !== 'create' && (
              <Field
                label={
                  edit.mode === 'inactivate'
                    ? 'Reason for inactivation'
                    : 'Reason for change'
                }
                name="summary-reason"
                error={fieldError}
                errorName="reason"
              >
                <Textarea
                  id="summary-reason"
                  name="reason"
                  required
                  maxLength={4000}
                  autoFocus={edit.mode === 'inactivate'}
                />
              </Field>
            )}
            {edit.mode === 'inactivate' && (
              <p className="notice warning">
                This item will remain in the summary as inactive. Its history
                will stay available. Confirm the patient and item before saving.
              </p>
            )}
            <div className="form-actions">
              <Button type="button" variant="outline" onClick={close}>
                Cancel edit
              </Button>
              <Button type="submit">
                {busy
                  ? 'Saving summary…'
                  : edit.mode === 'inactivate'
                    ? 'Confirm inactivation'
                    : 'Save summary item'}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {summary && (
        <div className="summary-sections">
          {sections.map((section) => {
            const items = summary.items.filter(
              (item) => item.content.kind === section.kind,
            );
            return (
              <section
                key={section.kind}
                className="summary-section"
                aria-labelledby={`summary-${section.kind}`}
              >
                <div className="section-heading">
                  <h3 id={`summary-${section.kind}`}>{section.title}</h3>
                  {summary.canCreate && (
                    <Button
                      variant="outline"
                      disabled={Boolean(edit)}
                      onClick={() =>
                        open({ mode: 'create', kind: section.kind })
                      }
                    >
                      Add {section.singular}
                    </Button>
                  )}
                </div>
                {!items.length && <p className="hint">{section.empty}</p>}
                <ul className="summary-items">
                  {items.map((item) => (
                    <li key={item.id} className="summary-item">
                      <div className="section-heading">
                        <h4>{contentName(item.content)}</h4>
                        <span
                          className={`badge ${item.status === 'inactive' ? '' : 'success'}`}
                        >
                          {item.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <ContentDetails fields={item} />
                      <p className="hint">
                        {item.authorName} · Updated {timestamp(item.updatedAt)}{' '}
                        · Revision {item.revision}
                      </p>
                      {item.canEdit && (
                        <div className="entry-actions">
                          {item.status === 'active' && (
                            <Button
                              variant="outline"
                              disabled={Boolean(edit)}
                              onClick={() =>
                                open({
                                  mode: 'update',
                                  kind: section.kind,
                                  item,
                                })
                              }
                            >
                              Update item
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            disabled={Boolean(edit)}
                            onClick={() =>
                              open({
                                mode: 'correct',
                                kind: section.kind,
                                item,
                              })
                            }
                          >
                            Add correction
                          </Button>
                          {item.status === 'active' && (
                            <Button
                              variant="outline"
                              disabled={Boolean(edit)}
                              onClick={() =>
                                open({
                                  mode: 'inactivate',
                                  kind: section.kind,
                                  item,
                                })
                              }
                            >
                              Inactivate item
                            </Button>
                          )}
                        </div>
                      )}
                      {!item.canEdit && (
                        <p className="hint">
                          Read-only. Only the original author can change this
                          item.
                        </p>
                      )}
                      <ItemHistory
                        key={`${item.id}-${item.revision}`}
                        api={api}
                        item={item}
                        onExpired={onExpired}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ItemHistory({
  api,
  item,
  onExpired,
}: {
  api: ClinicalSummaryApi;
  item: SummaryItem;
  onExpired: () => void;
}): ReactElement {
  const [history, setHistory] = useState<SummaryHistory[] | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return (): void => {
      active.current = false;
    };
  }, []);
  async function load(): Promise<void> {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.readSummaryHistory({ id: item.id });
      if (!active.current) return;
      if (result.ok) setHistory(result.data);
      else {
        setError(result.error);
        if (
          result.error.code === 'UNAUTHENTICATED' ||
          result.error.code === 'SESSION_CHANGED'
        )
          onExpired();
      }
    } catch {
      if (active.current) setError(unavailable);
    } finally {
      if (active.current) setLoading(false);
    }
  }
  return (
    <details
      className="summary-history"
      onToggle={(event) => {
        if (event.currentTarget.open && history === null && !loading && !error)
          void load();
      }}
    >
      <summary>View history for {contentName(item.content)}</summary>
      {loading && <p role="status">Loading item history…</p>}
      {error && (
        <div className="notice error" role="alert">
          <p>{error.message}</p>
          <Button variant="outline" onClick={() => void load()}>
            Retry item history
          </Button>
        </div>
      )}
      <ol>
        {history?.map((event) => (
          <li key={event.id}>
            <strong>
              Revision {event.revision} · {event.action} ·{' '}
              {event.snapshot.status}
            </strong>
            <p className="hint">
              {event.authorName} · {timestamp(event.createdAt)}
            </p>
            {event.reason && <p>Reason: {event.reason}</p>}
            <p>{contentName(event.snapshot.content)}</p>
            <ContentDetails fields={event.snapshot} />
          </li>
        ))}
      </ol>
    </details>
  );
}
