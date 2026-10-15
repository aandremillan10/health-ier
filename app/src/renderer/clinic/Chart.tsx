import { chartNames } from './contract';
import type { ChartTab } from './contract';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  ClinicApi,
  ClinicError,
  ClinicDocument,
  Entry,
  Patient,
  Principal,
  Vitals,
} from './contract';
import { canEditRegistry, canWriteEntry } from './contract';
import { Confirm, Empty, ErrorNotice, Field, Loading, State } from './ui';
import { useOperation } from './use-operation';
import { date, timestamp } from './format';

import { Corrections } from './Corrections';
import { measures } from './contract';

export function Chart({
  api,
  staff,
  patient,
  tab,
  demo,
  onEditPatient,
  onEntry,
  onVitals,
  onDocument,
  onExpired,
}: {
  api: ClinicApi;
  staff: Principal;
  patient: Patient;
  tab: ChartTab;
  demo: boolean;
  onEditPatient: () => void;
  onEntry: (entry?: Entry, correction?: boolean) => void;
  onVitals: (vitals?: Vitals, correction?: boolean) => void;
  onDocument: (
    entry?: Entry,
    document?: ClinicDocument,
    kind?: 'prescription' | 'certificate',
  ) => void;
  onExpired: () => void;
}): ReactElement {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [vitals, setVitals] = useState<Vitals[] | null>(null);
  const [documents, setDocuments] = useState<ClinicDocument[] | null>(null);
  const [documentsError, setDocumentsError] = useState<ClinicError | null>(
    null,
  );
  const [documentId, setDocumentId] = useState('');
  const [confirm, setConfirm] = useState<Entry | Vitals | null>(null);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState<ClinicError | null>(null);
  const { busy, error, run } = useOperation(onExpired);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return (): void => {
      mounted.current = false;
    };
  }, []);
  async function loadDocuments(): Promise<void> {
    setDocuments(null);
    setDocumentsError(null);
    try {
      const result = await api.listDocuments({ patientId: patient.id });
      if (!mounted.current) return;
      if (result.ok) setDocuments(result.data);
      else {
        setDocumentsError(result.error);
        if (result.error.code === 'UNAUTHENTICATED') onExpired();
      }
    } catch {
      if (!mounted.current) return;
      setDocumentsError({
        code: 'UNAVAILABLE',
        message:
          'Unable to load issued documents. Check the clinic connection and try again.',
      });
    }
  }
  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    setEntries(null);
    setVitals(null);
    if (tab === 'details') return;
    if (tab === 'vitals') {
      const result = await run(() => api.listVitals({ patientId: patient.id }));
      if (result) setVitals(result);
    } else {
      const result = await run(() =>
        api.listEntries({ patientId: patient.id, discipline: tab }),
      );
      if (!result) return;
      setEntries(result);
      if (tab === 'medical') {
        const measurements = await run(() =>
          api.listVitals({ patientId: patient.id }),
        );
        if (measurements) setVitals(measurements);
      }
    }
  }, [api, patient.id, run, tab]);
  useEffect(() => {
    if (tab === 'details') return;
    let active = true;
    function failed(failure: ClinicError): void {
      if (!active) return;
      setLoadError(failure);
      if (failure.code === 'UNAUTHENTICATED') onExpired();
    }
    if (tab === 'vitals' || tab === 'medical') {
      void api
        .listVitals({ patientId: patient.id })
        .then((result) => {
          if (!active) return;
          if (result.ok) setVitals(result.data);
          else failed(result.error);
        })
        .catch(() =>
          failed({
            code: 'UNAVAILABLE',
            message:
              'Unable to load vital signs. Check the clinic connection and try again.',
          }),
        );
    }
    if (tab !== 'vitals') {
      void api
        .listEntries({ patientId: patient.id, discipline: tab })
        .then((result) => {
          if (!active) return;
          if (result.ok) setEntries(result.data);
          else failed(result.error);
        })
        .catch(() =>
          failed({
            code: 'UNAVAILABLE',
            message:
              'Unable to load this chart. Check the clinic connection and try again.',
          }),
        );
      if (tab === 'medical')
        void api
          .listDocuments({ patientId: patient.id })
          .then((result) => {
            if (!active) return;
            if (result.ok) setDocuments(result.data);
            else {
              setDocumentsError(result.error);
              if (result.error.code === 'UNAUTHENTICATED') onExpired();
            }
          })
          .catch(() => {
            if (!active) return;
            setDocumentsError({
              code: 'UNAVAILABLE',
              message:
                'Unable to load documents. Check the clinic connection and try again.',
            });
          });
    }
    return (): void => {
      active = false;
    };
  }, [api, patient.id, tab, onExpired]);
  async function finalize(): Promise<void> {
    if (!confirm) return;
    const input = { id: confirm.id, expectedRevision: confirm.revision };
    const result = await run<Entry | Vitals>(() =>
      tab === 'vitals' ? api.finalizeVitals(input) : api.finalizeEntry(input),
    );
    if (result) {
      setConfirm(null);
      setNotice(
        demo
          ? 'Demo entry finalized in memory.'
          : 'Entry finalized on the clinic server.',
      );
      await load();
      requestAnimationFrame(() =>
        document.getElementById('main-content')?.focus(),
      );
    } else setConfirm(null);
  }
  async function openDocument(id: string): Promise<void> {
    const result = await run(async () => {
      const response = await api.getDocument({ id });
      if (response.ok && response.data.patient.id !== patient.id)
        return {
          ok: false as const,
          error: {
            code: 'DENIED' as const,
            message:
              'This document belongs to another patient. Open the correct patient record.',
          },
        };
      return response;
    });
    if (result) onDocument(undefined, result);
  }
  const orderedEntries =
    entries
      ?.slice()
      .sort(
        (a, b) =>
          b.consultationDate.localeCompare(a.consultationDate) ||
          b.createdAt.localeCompare(a.createdAt),
      ) ?? null;
  if (tab === 'details')
    return (
      <section className="panel">
        <div className="section-heading">
          <h2>Patient details</h2>
          {canEditRegistry(staff) && (
            <Button variant="outline" onClick={onEditPatient}>
              Edit patient details
            </Button>
          )}
        </div>
        <dl className="demographics">
          <div>
            <dt>Patient number</dt>
            <dd>{patient.id}</dd>
          </div>
          <div>
            <dt>Birth date</dt>
            <dd>{date(patient.dateOfBirth)}</dd>
          </div>
          <div>
            <dt>Sex</dt>
            <dd className="capitalize">
              {patient.sex === 'unknown' ? 'Not recorded' : patient.sex}
            </dd>
          </div>
          {staff.role !== 'medtech' && (
            <>
              <div>
                <dt>Address</dt>
                <dd>{patient.address || 'Not recorded'}</dd>
              </div>
              <div>
                <dt>Category</dt>
                <dd className="capitalize">
                  {patient.patientCategory === 'unknown'
                    ? 'Not recorded'
                    : patient.patientCategory}
                </dd>
              </div>
              <div>
                <dt>Employee reference</dt>
                <dd>{patient.employeeIdentifier || 'Not recorded'}</dd>
              </div>
            </>
          )}
        </dl>
        {['clerk', 'attendant'].includes(staff.role) && (
          <p className="hint">
            Your account handles patient details
            {staff.role === 'attendant' ? ' and vital signs' : ''}. Provider
            notes are restricted.
          </p>
        )}
      </section>
    );
  return (
    <section>
      <div className="page-heading">
        <h2>{tab === 'vitals' ? 'Vital signs' : chartNames[tab]}</h2>
        {tab === 'vitals'
          ? staff.role === 'attendant' && (
              <Button onClick={() => onVitals()}>Record vital signs</Button>
            )
          : canWriteEntry(staff, tab) &&
            tab === 'medical' && (
              <Button onClick={() => onEntry()}>New medical entry</Button>
            )}
      </div>
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      {staff.isHead && tab !== 'medical' && (
        <p className="notice">
          Clinic head oversight · Read-only access to this chart.
        </p>
      )}
      <ErrorNotice error={error ?? loadError}>
        <Button variant="outline" onClick={() => void load()}>
          Try again
        </Button>
      </ErrorNotice>
      {(busy ||
        (!error &&
          !loadError &&
          (tab === 'vitals' ? vitals === null : entries === null))) && (
        <Loading>Loading {tab === 'vitals' ? 'vital signs' : 'chart'}…</Loading>
      )}
      {tab === 'vitals' && vitals && vitals.length === 0 && (
        <Empty
          action={
            staff.role === 'attendant' ? (
              <Button onClick={() => onVitals()}>Record vital signs</Button>
            ) : undefined
          }
        >
          No vital signs recorded. Measurements can be recorded without a
          consultation.
        </Empty>
      )}
      {tab === 'vitals' &&
        vitals?.map((v) => (
          <article key={v.id} className="panel entry" data-testid="vitals">
            <div className="section-heading">
              <h3>{timestamp(v.recordedAt)}</h3>
              <State status={v.status} />
            </div>
            <p className="hint">
              Recorded by {v.authorName} · Revision {v.revision}
            </p>
            <Measurements record={v} />
            <Corrections original={v} />
            {staff.role === 'attendant' && v.authorId === staff.id ? (
              <div className="entry-actions">
                {v.status === 'draft' ? (
                  <>
                    <Button variant="outline" onClick={() => onVitals(v)}>
                      Edit draft
                    </Button>
                    <Button onClick={() => setConfirm(v)}>
                      Finalize entry
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => onVitals(v, true)}>
                    Add correction
                  </Button>
                )}
              </div>
            ) : staff.isHead && v.status === 'finalized' ? (
              <div className="entry-actions">
                <Button variant="outline" onClick={() => onVitals(v, true)}>
                  Correct finalized vital signs
                </Button>
              </div>
            ) : (
              <p className="hint">
                Read-only · Only the author can change these measurements.
              </p>
            )}
          </article>
        ))}
      {tab !== 'vitals' && orderedEntries && orderedEntries.length === 0 && (
        <Empty>
          No entries in this chart.
          {tab === 'medical' && canWriteEntry(staff, tab)
            ? ' Select New medical entry to record a consultation.'
            : ''}
        </Empty>
      )}
      {tab === 'medical' && orderedEntries && orderedEntries.length > 0 && (
        <section
          className="consultation-history"
          aria-labelledby="consultation-history-title"
        >
          <div className="section-heading">
            <h3 id="consultation-history-title">Consultation history</h3>
            <span className="hint">
              {orderedEntries.length}{' '}
              {orderedEntries.length === 1 ? 'consultation' : 'consultations'}
              {' · Newest first'}
            </span>
          </div>
          <p className="hint">
            Select an entry to open its full note and correction history.
          </p>
          <ol>
            {orderedEntries.map((entry) => (
              <li key={entry.id}>
                <a href={`#consultation-${entry.id}`}>
                  <time dateTime={entry.consultationDate}>
                    {date(entry.consultationDate)}
                  </time>
                  <State status={entry.status} />
                  <span className="consultation-history-detail">
                    <strong>{entry.authorName}</strong>
                    <span>
                      {' · '}
                      {entry.reason || 'Reason not recorded'}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
      {tab !== 'vitals' &&
        orderedEntries?.map((entry) => {
          const selectedVitals = vitals?.find((v) => v.id === entry.vitalsId);
          return (
            <article
              key={entry.id}
              id={tab === 'medical' ? `consultation-${entry.id}` : undefined}
              tabIndex={tab === 'medical' ? -1 : undefined}
              className="panel entry"
              data-testid="entry"
            >
              <div className="section-heading">
                <h3>{date(entry.consultationDate)}</h3>
                <State status={entry.status} />
              </div>
              <p className="hint">
                {entry.authorName} · Revision {entry.revision}
              </p>
              <dl className="clinical-content">
                <div>
                  <dt>{tab === 'medical' ? 'Reason / symptoms' : 'Record'}</dt>
                  <dd>{entry.reason || 'Not recorded'}</dd>
                </div>
                <div>
                  <dt>Findings</dt>
                  <dd>{entry.findings || 'Not recorded'}</dd>
                </div>
                {tab === 'medical' && (
                  <>
                    <div>
                      <dt>Clinical impression</dt>
                      <dd>{entry.clinicalImpression || 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>Plan / instructions</dt>
                      <dd>{entry.plan || 'Not recorded'}</dd>
                    </div>
                    <div className="entry-vitals">
                      <dt>Selected vital signs</dt>
                      <dd>
                        {!entry.vitalsId
                          ? 'None selected'
                          : selectedVitals
                            ? timestamp(selectedVitals.recordedAt)
                            : vitals === null && !loadError && !error
                              ? 'Loading selected vital signs…'
                              : 'Selected vital signs unavailable. Open Vital signs to retry.'}
                      </dd>
                      {selectedVitals && (
                        <dd>
                          <p className="hint">
                            Recorded by {selectedVitals.authorName}
                          </p>
                          <Measurements record={selectedVitals} />
                        </dd>
                      )}
                    </div>
                  </>
                )}
              </dl>
              <Corrections original={entry} />
              {entry.authorId === staff.id &&
              canWriteEntry(staff, tab) &&
              tab === 'medical' ? (
                <div className="entry-actions">
                  {entry.status === 'draft' ? (
                    <>
                      <Button variant="outline" onClick={() => onEntry(entry)}>
                        Edit draft
                      </Button>
                      <Button onClick={() => setConfirm(entry)}>
                        Finalize entry
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => onEntry(entry, true)}
                      >
                        Add correction
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          onDocument(entry, undefined, 'prescription')
                        }
                      >
                        Prepare prescription
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          onDocument(entry, undefined, 'certificate')
                        }
                      >
                        Prepare certificate
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <p className="hint">
                  Read-only ·{' '}
                  {entry.authorId !== staff.id
                    ? 'Only the original author can edit, correct, or issue documents.'
                    : 'This isolated proof record has no full workflow in this demo.'}
                </p>
              )}
            </article>
          );
        })}
      {tab === 'medical' && (
        <section className="panel" aria-label="Issued documents">
          <h2>Issued documents</h2>
          {documents === null && !documentsError && (
            <Loading>Loading issued documents…</Loading>
          )}
          <ErrorNotice error={documentsError}>
            <Button variant="outline" onClick={() => void loadDocuments()}>
              Retry document history
            </Button>
          </ErrorNotice>
          {documents?.length === 0 && (
            <p className="hint">No issued documents for this patient.</p>
          )}
          {!demo && (
            <form
              className="document-lookup"
              onSubmit={(event) => {
                event.preventDefault();
                void openDocument(documentId.trim());
              }}
            >
              <p className="hint">
                Documents issued for this patient remain available for reprint.
                You can also open a known document ID.
              </p>
              <Field label="Issued document ID" name="document-id">
                <div className="search-controls">
                  <Input
                    id="document-id"
                    required
                    maxLength={80}
                    disabled={busy}
                    value={documentId}
                    onChange={(event) => setDocumentId(event.target.value)}
                  />
                  <Button type="submit" disabled={busy || !documentId.trim()}>
                    Open document
                  </Button>
                </div>
              </Field>
            </form>
          )}
          <ul className="document-list">
            {documents?.map((doc) => (
              <li key={doc.id}>
                <div>
                  <strong>
                    {doc.input.kind === 'prescription'
                      ? 'Prescription'
                      : 'Medical certificate'}
                  </strong>
                  <p className="hint">
                    {date(doc.input.issueDate)} · {doc.issuer.displayName}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={busy || !doc.id}
                  onClick={() => {
                    if (doc.id) void openDocument(doc.id);
                  }}
                >
                  View / reprint
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {confirm && (
        <Confirm
          title="Finalize this entry?"
          action="Confirm finalization"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void finalize()}
        >
          <p>
            The original will be preserved. Later changes require an attributed
            correction.
          </p>
        </Confirm>
      )}
    </section>
  );
}

function Measurements({ record }: { record: Vitals }): ReactElement {
  return (
    <dl className="measurements">
      {Object.entries(measures).map(([key, label]) => (
        <div key={key}>
          <dt>{label}</dt>
          <dd>{record[key as keyof typeof measures] ?? 'Not taken'}</dd>
        </div>
      ))}
    </dl>
  );
}
