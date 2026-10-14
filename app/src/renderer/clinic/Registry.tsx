import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchField } from '@/components/ui/search-field';
import type { ClinicApi, ClinicError, Patient, Principal } from './contract';
import { canEditRegistry } from './contract';
import { Empty, ErrorNotice, Field, Loading } from './ui';
import { useOperation } from './use-operation';
import { date, today } from './format';

export function Registry({
  api,
  staff,
  demo,
  onSelect,
  onRegister,
  onExpired,
}: {
  api: ClinicApi;
  staff: Principal;
  demo: boolean;
  onSelect: (patient: Patient) => void;
  onRegister: () => void;
  onExpired: () => void;
}): ReactElement {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [initialError, setInitialError] = useState<ClinicError | null>(null);
  const { busy, error, run } = useOperation(onExpired);
  const searchId = useRef(0);
  useEffect(() => {
    if (!demo) return;
    let active = true;
    const request = ++searchId.current;
    void api
      .findPatients({ search: '' })
      .then((result) => {
        if (!active || request !== searchId.current) return;
        if (result.ok) setPatients(result.data);
        else {
          setInitialError(result.error);
          if (result.error.code === 'UNAUTHENTICATED') onExpired();
        }
      })
      .catch(() => {
        if (active && request === searchId.current)
          setInitialError({
            code: 'UNAVAILABLE',
            message: 'Unable to load demo patients. Select Try again.',
          });
      });
    return (): void => {
      active = false;
    };
  }, [api, demo, onExpired]);
  const displayError = error ?? initialError;
  const loading = busy || (demo && patients === null && !displayError);
  async function search(event?: FormEvent): Promise<void> {
    event?.preventDefault();
    const request = ++searchId.current;
    setInitialError(null);
    setPatients(null);
    const result = await run(() => api.findPatients({ search: query }));
    if (result && request === searchId.current) {
      setPatients(result);
      setLastQuery(query);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <h1>Patient records</h1>
        {canEditRegistry(staff) && (
          <Button onClick={onRegister}>Register patient</Button>
        )}
      </div>
      <form className="panel search-panel" onSubmit={(e) => void search(e)}>
        <Field name="patient-search" label="Find a patient" error={error}>
          <div className="search-controls">
            <SearchField
              disabled={busy}
              id="patient-search"
              value={query}
              onValueChange={setQuery}
              placeholder="Patient name or number"
              autoFocus
            />
            <Button disabled={busy} type="submit">
              {busy ? 'Finding…' : 'Find patient'}
            </Button>
          </div>
        </Field>
        <p className="hint search-hint">
          Press <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd> to search from any screen.
        </p>
      </form>
      <ErrorNotice error={displayError}>
        <Button variant="outline" onClick={() => void search()}>
          Try again
        </Button>
      </ErrorNotice>
      {loading && <Loading>Finding patient records…</Loading>}
      {!loading && !displayError && patients === null && (
        <Empty>Enter a patient name or number to find their record.</Empty>
      )}
      {patients && patients.length === 0 && (
        <Empty
          action={
            canEditRegistry(staff) && (
              <Button onClick={onRegister}>Register patient</Button>
            )
          }
        >
          No records for “{lastQuery}”. Try a shorter name or check the
          spelling.
        </Empty>
      )}
      {patients && patients.length > 0 && (
        <section className="panel table-panel">
          <div className="section-heading">
            <h2>{demo && !lastQuery ? 'Demo patients' : 'Search results'}</h2>
            <span className="muted" aria-live="polite">
              Records ({patients.length})
            </span>
          </div>
          {patients.some((p, i) =>
            patients.some(
              (other, j) =>
                i !== j &&
                p.fullName.toLocaleLowerCase() ===
                  other.fullName.toLocaleLowerCase(),
            ),
          ) && (
            <p className="notice warning">
              Same name, different records. Compare the number and birth date.
            </p>
          )}
          <div
            className="table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Patient search results"
          >
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Patient number</th>
                  <th>Birth date</th>
                  {staff.role !== 'medtech' && <th>Category</th>}
                  <th>
                    <span className="sr-only">Open record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.fullName}</strong>
                    </td>
                    <td>{p.id}</td>
                    <td>{date(p.dateOfBirth)}</td>
                    {staff.role !== 'medtech' && (
                      <td className="capitalize">{p.patientCategory}</td>
                    )}
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Open ${p.fullName} ${p.id}`}
                        onClick={() => onSelect(p)}
                      >
                        Open record
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}

export function PatientForm({
  api,
  patient,
  onSaved,
  onOpenExisting,
  onCancel,
  onDirty,
  onExpired,
}: {
  api: ClinicApi;
  patient?: Patient;
  onSaved: (patient: Patient) => void;
  onOpenExisting: (patient: Patient) => void;
  onCancel: () => void;
  onDirty: (dirty: boolean) => void;
  onExpired: () => void;
}): ReactElement {
  const [form, setForm] = useState({
    fullName: patient?.fullName ?? '',
    sex: patient?.sex ?? 'unknown',
    dateOfBirth: patient?.dateOfBirth ?? '',
    address: patient?.address ?? '',
    patientCategory: patient?.patientCategory ?? 'unknown',
    employeeIdentifier: patient?.employeeIdentifier ?? '',
  });
  const [revision, setRevision] = useState(patient?.revision ?? 0);
  const [matches, setMatches] = useState<Patient[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [latest, setLatest] = useState<Patient | null>(null);
  const checkId = useRef(0);
  const { busy, error, conflict, run, clearError } = useOperation(onExpired);
  function change(name: keyof typeof form, value: string): void {
    setForm({ ...form, [name]: value });
    onDirty(true);
    if (name === 'fullName' || name === 'dateOfBirth') {
      checkId.current++;
      setMatches(null);
      setConfirmed(false);
    }
  }
  async function check(): Promise<void> {
    const request = ++checkId.current;
    const records = await run(() =>
      api.findPatients({ search: form.fullName }),
    );
    if (records && request === checkId.current) setMatches(records);
  }
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    const input = { ...form, dateOfBirth: form.dateOfBirth || null };
    const result = await run(() =>
      patient
        ? api.updatePatient({
            ...input,
            id: patient.id,
            expectedRevision: revision,
          })
        : api.createPatient(input),
    );
    if (result) {
      onSaved(result);
    }
  }
  async function reviewLatest(): Promise<void> {
    if (!patient) return;
    const result = await run(() => api.getPatient({ id: patient.id }));
    if (result) setLatest(result);
  }
  return (
    <section>
      <div className="page-heading">
        <h1>{patient ? 'Edit patient details' : 'Register patient'}</h1>
        <span className="badge">
          {patient ? `Revision ${revision}` : 'New record'}
        </span>
      </div>
      <form
        className="panel form-panel"
        aria-busy={busy}
        onSubmit={(e) => void save(e)}
      >
        <ErrorNotice error={error}>
          {conflict && (
            <Button
              variant="outline"
              onClick={() => void reviewLatest()}
              type="button"
            >
              Review latest version
            </Button>
          )}
        </ErrorNotice>
        {latest && (
          <div className="notice">
            <h2>Latest saved version · Revision {latest.revision}</h2>
            <dl className="demographics">
              {(
                [
                  ['Name', latest.fullName],
                  ['Birth date', date(latest.dateOfBirth)],
                  ['Sex', latest.sex],
                  ['Address', latest.address],
                  ['Category', latest.patientCategory],
                  ['Employee reference', latest.employeeIdentifier],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || 'Not recorded'}</dd>
                </div>
              ))}
            </dl>
            <p>Your input remains in the form. Compare it before you retry.</p>
            <Button
              type="button"
              variant="outline"
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
        <div className="form-grid">
          <Field label="Full name" name="fullName" error={error}>
            <Input
              disabled={busy}
              id="fullName"
              value={form.fullName}
              onChange={(e) => change('fullName', e.target.value)}
              required
              maxLength={180}
              aria-invalid={Boolean(error?.fieldErrors?.fullName)}
              aria-describedby={
                error?.fieldErrors?.fullName ? 'fullName-error' : undefined
              }
            />
          </Field>
          <Field
            label="Birth date (optional)"
            name="dateOfBirth"
            hint="Leave blank if unknown."
            error={error}
          >
            <Input
              disabled={busy}
              id="dateOfBirth"
              type="date"
              value={form.dateOfBirth}
              max={today()}
              onChange={(e) => change('dateOfBirth', e.target.value)}
              aria-describedby="dateOfBirth-hint"
            />
          </Field>
          <Field label="Sex" name="sex" error={error}>
            <select
              className="clinic-select"
              disabled={busy}
              id="sex"
              value={form.sex}
              onChange={(e) => change('sex', e.target.value)}
            >
              <option value="unknown">Not recorded</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Category" name="patientCategory" error={error}>
            <select
              className="clinic-select"
              disabled={busy}
              id="patientCategory"
              value={form.patientCategory}
              onChange={(e) => change('patientCategory', e.target.value)}
            >
              <option value="unknown">Not recorded</option>
              <option value="employee">Employee</option>
              <option value="dependent">Dependent</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Address" name="address" error={error}>
            <Input
              disabled={busy}
              id="address"
              value={form.address}
              onChange={(e) => change('address', e.target.value)}
              maxLength={300}
            />
          </Field>
          <Field
            label="Employee reference (optional)"
            name="employeeIdentifier"
            error={error}
          >
            <Input
              disabled={busy}
              id="employeeIdentifier"
              value={form.employeeIdentifier}
              onChange={(e) => change('employeeIdentifier', e.target.value)}
              maxLength={80}
            />
          </Field>
        </div>
        {!patient && (
          <section className="duplicate-check">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !form.fullName.trim()}
              onClick={() => void check()}
            >
              Check existing records
            </Button>
            {matches && matches.length === 0 && (
              <p className="hint">No matching name found.</p>
            )}
            {matches && matches.length > 0 && (
              <>
                <h2>Possible existing records</h2>
                <ul>
                  {matches.map((p) => (
                    <li key={p.id}>
                      {p.fullName} · {p.id} · {date(p.dateOfBirth)}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          onOpenExisting(p);
                        }}
                      >
                        Open existing record
                      </Button>
                    </li>
                  ))}
                </ul>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I checked these records. This is a different patient.
                </label>
              </>
            )}
          </section>
        )}
        <div className="form-actions sticky-form-actions">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              busy ||
              conflict ||
              latest !== null ||
              (!patient &&
                (matches === null || (matches.length > 0 && !confirmed)))
            }
          >
            {busy ? 'Saving…' : 'Save patient'}
          </Button>
        </div>
      </form>
    </section>
  );
}
