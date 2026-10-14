import { useEffect, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  ClinicApi,
  ClinicError,
  Entry,
  EntryInput,
  Patient,
  Vitals,
  VitalsInput,
} from './contract';
import { ErrorNotice, Field } from './ui';
import { useOperation } from './use-operation';
import { Corrections } from './Corrections';
import { currentContent } from './contract';
import { ageOnDate, timestamp, today } from './format';

type FormProps = {
  api: ClinicApi;
  patient: Patient;
  onDone: () => void;
  onDirty: (dirty: boolean) => void;
  onCancel: () => void;
  onExpired: () => void;
};
export function EntryForm({
  api,
  patient,
  entry,
  correction = false,
  onDone,
  onDirty,
  onCancel,
  onExpired,
}: FormProps & { entry?: Entry; correction?: boolean }): ReactElement {
  const content = entry && correction ? currentContent(entry) : entry;
  const [form, setForm] = useState<Omit<EntryInput, 'ageAtConsultation'>>({
    consultationDate: content?.consultationDate ?? today(),
    cs: content?.cs ?? '',
    vitalsId: content?.vitalsId ?? null,
    reason: content?.reason ?? '',
    findings: content?.findings ?? '',
    clinicalImpression: content?.clinicalImpression ?? '',
    plan: content?.plan ?? '',
  });
  const [reason, setReason] = useState('');
  const [vitals, setVitals] = useState<Vitals[]>([]);
  const [vitalsError, setVitalsError] = useState<ClinicError | null>(null);
  const [revision, setRevision] = useState(entry?.revision ?? 0);
  const [latest, setLatest] = useState<Entry | null>(null);
  const [reviewError, setReviewError] = useState<ClinicError | null>(null);
  const { busy, error, conflict, run, clearError } = useOperation(onExpired);
  useEffect(() => {
    let active = true;
    void api
      .listVitals({ patientId: patient.id })
      .then((result) => {
        if (!active) return;
        if (result.ok)
          setVitals(result.data.filter((v) => v.status === 'finalized'));
        else {
          setVitalsError(result.error);
          if (result.error.code === 'UNAUTHENTICATED') onExpired();
        }
      })
      .catch(() => {
        if (active)
          setVitalsError({
            code: 'UNAVAILABLE',
            message:
              'Unable to load vital signs. Check the clinic connection and try again, or explicitly select None.',
          });
      });
    return (): void => {
      active = false;
    };
  }, [api, patient.id, onExpired]);
  useEffect(() => (): void => onDirty(false), [onDirty]);
  function change<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ): void {
    setForm({ ...form, [key]: value });
    onDirty(true);
  }
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    const input: EntryInput = {
      ...form,
      ageAtConsultation: ageOnDate(patient.dateOfBirth, form.consultationDate),
    };
    const result = await run(() =>
      correction && entry
        ? api.correctEntry({
            id: entry.id,
            expectedRevision: revision,
            reason,
            correctedContent: input,
          })
        : api.saveEntry({
            ...input,
            patientId: patient.id,
            discipline: 'medical',
            id: entry?.id,
            expectedRevision: entry ? revision : undefined,
          }),
    );
    if (result) {
      onDirty(false);
      onDone();
    }
  }
  async function review(): Promise<void> {
    setReviewError(null);
    const records = await run(() =>
      api.listEntries({ patientId: patient.id, discipline: 'medical' }),
    );
    const record = records?.find((e) => e.id === entry?.id);
    if (record) setLatest(record);
    else if (records)
      setReviewError({
        code: 'NOT_FOUND',
        message:
          'Latest entry is unavailable. Retry the review or return to the chart.',
      });
  }
  return (
    <section>
      <div className="page-heading">
        <h2>
          {correction
            ? 'Correct medical entry'
            : entry
              ? 'Edit medical draft'
              : 'New medical entry'}
        </h2>
        <span className="badge warning">
          {correction ? 'Original preserved' : 'Draft'}
        </span>
      </div>
      <form
        className="panel form-panel"
        aria-busy={busy}
        onSubmit={(e) => void save(e)}
      >
        <ErrorNotice error={vitalsError}>
          <Button
            type="button"
            variant="outline"
            onClick={async (): Promise<void> => {
              const result = await run(() =>
                api.listVitals({ patientId: patient.id }),
              );
              if (result) {
                setVitals(result.filter((v) => v.status === 'finalized'));
                setVitalsError(null);
              }
            }}
          >
            Retry vital signs
          </Button>
        </ErrorNotice>
        <ErrorNotice error={error ?? reviewError}>
          {conflict && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void review()}
            >
              Review latest version
            </Button>
          )}
        </ErrorNotice>
        {latest && (
          <div className="notice">
            <h3>
              Latest version · Revision {latest.revision} · {latest.status}
            </h3>
            <dl className="clinical-content">
              {(
                [
                  ['Consultation date', latest.consultationDate],
                  ['Age', latest.ageAtConsultation],
                  ['CS', latest.cs],
                  ['Selected vital signs', latest.vitalsId],
                  ['Reason / symptoms', latest.reason],
                  ['Findings', latest.findings],
                  ['Clinical impression', latest.clinicalImpression],
                  ['Plan / instructions', latest.plan],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value === null || value === '' ? 'Not recorded' : value}
                  </dd>
                </div>
              ))}
            </dl>
            <Corrections original={latest} />
            <Button
              type="button"
              variant="outline"
              disabled={!correction && latest.status !== 'draft'}
              onClick={() => {
                setRevision(latest.revision);
                setLatest(null);
                clearError();
              }}
            >
              Use latest revision and keep my input
            </Button>
            {!correction && latest.status === 'finalized' && (
              <p>
                This entry is finalized. Return to the chart and add a
                correction.
              </p>
            )}
          </div>
        )}
        {correction && (
          <Field
            label="Correction reason"
            name="correctionReason"
            errorName="reason"
            error={error}
          >
            <Input
              disabled={busy}
              id="correctionReason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                onDirty(true);
              }}
              required
            />
          </Field>
        )}
        <div className="form-grid">
          <Field
            label="Consultation date"
            name="consultationDate"
            error={error}
          >
            <Input
              disabled={busy}
              id="consultationDate"
              type="date"
              value={form.consultationDate}
              onChange={(e) => change('consultationDate', e.target.value)}
              required
            />
          </Field>
          <Field label="CS (optional)" name="cs" error={error}>
            <Input
              disabled={busy}
              id="cs"
              value={form.cs}
              onChange={(e) => change('cs', e.target.value)}
            />
          </Field>
          <Field
            label="Finalized vital signs"
            name="vitalsId"
            hint="Select the relevant measurements or None. A consultation does not require vital signs."
            error={error}
          >
            <select
              disabled={busy}
              id="vitalsId"
              value={form.vitalsId ?? ''}
              onChange={(e) => change('vitalsId', e.target.value || null)}
              aria-describedby="vitalsId-hint"
            >
              <option value="">None selected</option>
              {vitals.map((v) => (
                <option key={v.id} value={v.id}>
                  {timestamp(v.recordedAt)} · {v.authorName}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Reason / symptoms" name="reason" error={error}>
          <Input
            disabled={busy}
            id="reason"
            value={form.reason}
            onChange={(e) => change('reason', e.target.value)}
            required
            aria-invalid={Boolean(error?.fieldErrors?.reason)}
            aria-describedby={
              error?.fieldErrors?.reason ? 'reason-error' : undefined
            }
          />
        </Field>
        {(['findings', 'clinicalImpression', 'plan'] as const).map((key) => (
          <Field
            key={key}
            label={
              {
                findings: 'Findings',
                clinicalImpression: 'Clinical impression',
                plan: 'Plan / instructions',
              }[key]
            }
            name={key}
            error={error}
          >
            <Textarea
              disabled={busy}
              id={key}
              value={form[key]}
              onChange={(e) => change(key, e.target.value)}
              rows={3}
            />
          </Field>
        ))}
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || conflict || latest !== null}>
            {busy ? 'Saving…' : correction ? 'Save correction' : 'Save draft'}
          </Button>
        </div>
      </form>
    </section>
  );
}

const vitalFields = [
  ['systolic', 'Systolic pressure (mmHg)'],
  ['diastolic', 'Diastolic pressure (mmHg)'],
  ['temperature', 'Temperature (°C)'],
  ['pulse', 'Pulse (/min)'],
  ['respiratoryRate', 'Respiratory rate (/min)'],
  ['oxygenSaturation', 'Oxygen saturation (%)'],
  ['weight', 'Weight (kg)'],
] as const;
export function VitalsForm({
  api,
  patient,
  record,
  correction = false,
  onDone,
  onDirty,
  onCancel,
  onExpired,
}: FormProps & { record?: Vitals; correction?: boolean }): ReactElement {
  const content = record && correction ? currentContent(record) : record;
  const [values, setValues] = useState<
    Record<(typeof vitalFields)[number][0], string>
  >({
    systolic: String(content?.systolic ?? ''),
    diastolic: String(content?.diastolic ?? ''),
    temperature: String(content?.temperature ?? ''),
    pulse: String(content?.pulse ?? ''),
    respiratoryRate: String(content?.respiratoryRate ?? ''),
    oxygenSaturation: String(content?.oxygenSaturation ?? ''),
    weight: String(content?.weight ?? ''),
  });
  const [recordedAt, setRecordedAt] = useState(() =>
    content?.recordedAt
      ? new Date(new Date(content.recordedAt).getTime() + 8 * 3600000)
          .toISOString()
          .slice(0, 16)
      : new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16),
  );
  const [reason, setReason] = useState('');
  const [revision, setRevision] = useState(record?.revision ?? 0);
  const [latest, setLatest] = useState<Vitals | null>(null);
  const [reviewError, setReviewError] = useState<ClinicError | null>(null);
  const { busy, error, conflict, run, clearError } = useOperation(onExpired);
  useEffect(() => (): void => onDirty(false), [onDirty]);
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    const input: VitalsInput = {
      recordedAt: new Date(`${recordedAt}+08:00`).toISOString(),
      systolic: values.systolic === '' ? null : Number(values.systolic),
      diastolic: values.diastolic === '' ? null : Number(values.diastolic),
      temperature:
        values.temperature === '' ? null : Number(values.temperature),
      pulse: values.pulse === '' ? null : Number(values.pulse),
      respiratoryRate:
        values.respiratoryRate === '' ? null : Number(values.respiratoryRate),
      oxygenSaturation:
        values.oxygenSaturation === '' ? null : Number(values.oxygenSaturation),
      weight: values.weight === '' ? null : Number(values.weight),
    };
    const result = await run(() =>
      correction && record
        ? api.correctVitals({
            ...input,
            id: record.id,
            expectedRevision: revision,
            reason,
            correctedContent: input,
          })
        : api.saveVitals({
            ...input,
            patientId: patient.id,
            id: record?.id,
            expectedRevision: record ? revision : undefined,
          }),
    );
    if (result) {
      onDirty(false);
      onDone();
    }
  }
  async function review(): Promise<void> {
    setReviewError(null);
    const records = await run(() => api.listVitals({ patientId: patient.id }));
    const found = records?.find((v) => v.id === record?.id);
    if (found) setLatest(found);
    else if (records)
      setReviewError({
        code: 'NOT_FOUND',
        message:
          'Latest measurements are unavailable. Retry the review or return to the chart.',
      });
  }
  return (
    <section>
      <div className="page-heading">
        <h2>{correction ? 'Correct vital signs' : 'Record vital signs'}</h2>
        <span className="badge warning">
          {correction ? 'Original preserved' : 'Draft'}
        </span>
      </div>
      <form
        className="panel form-panel"
        aria-busy={busy}
        onSubmit={(e) => void save(e)}
      >
        <ErrorNotice error={error ?? reviewError}>
          {conflict && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void review()}
            >
              Review latest version
            </Button>
          )}
        </ErrorNotice>
        {latest && (
          <div className="notice">
            <h3>
              Latest measurements · Revision {latest.revision} · {latest.status}
            </h3>
            <p>{timestamp(latest.recordedAt)}</p>
            <dl className="measurements">
              {vitalFields.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>{latest[key] ?? 'Not taken'}</dd>
                </div>
              ))}
            </dl>
            <Corrections original={latest} />
            <Button
              type="button"
              variant="outline"
              disabled={!correction && latest.status !== 'draft'}
              onClick={() => {
                setRevision(latest.revision);
                setLatest(null);
                clearError();
              }}
            >
              Use latest revision and keep my input
            </Button>
          </div>
        )}
        {correction && (
          <Field
            label="Correction reason"
            name="correctionReason"
            errorName="reason"
            error={error}
          >
            <Input
              disabled={busy}
              id="correctionReason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                onDirty(true);
              }}
              required
            />
          </Field>
        )}
        <Field
          label="Recorded at (Asia/Manila)"
          name="recordedAt"
          error={error}
        >
          <Input
            disabled={busy}
            id="recordedAt"
            type="datetime-local"
            value={recordedAt}
            onChange={(e) => {
              setRecordedAt(e.target.value);
              onDirty(true);
            }}
            required
          />
        </Field>
        <p className="hint">
          Leave untaken measurements blank. Blank values are saved as Not taken.
        </p>
        <div className="form-grid">
          {vitalFields.map(([key, label]) => (
            <Field key={key} label={label} name={key} error={error}>
              <Input
                disabled={busy}
                id={key}
                type="number"
                min="0"
                max={key === 'oxygenSaturation' ? 100 : undefined}
                step="any"
                value={values[key]}
                onChange={(e) => {
                  setValues({ ...values, [key]: e.target.value });
                  onDirty(true);
                }}
                aria-invalid={Boolean(error?.fieldErrors?.[key])}
                aria-describedby={
                  error?.fieldErrors?.[key] ? `${key}-error` : undefined
                }
              />
            </Field>
          ))}
        </div>
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || conflict || latest !== null}>
            {busy ? 'Saving…' : correction ? 'Save correction' : 'Save draft'}
          </Button>
        </div>
      </form>
    </section>
  );
}
