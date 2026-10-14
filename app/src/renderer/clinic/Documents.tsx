import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  ClinicApi,
  ClinicError,
  ClinicDocument,
  DocumentInput,
  Entry,
  Printer,
} from './contract';
import { Confirm, ErrorNotice, Field, State } from './ui';
import { useOperation } from './use-operation';
import { Corrections } from './Corrections';
import { date, today } from './format';
import headerUrl from '../../../../docs/headers/header.jpg';

export function Documents({
  api,
  entry,
  issued,
  kind = 'prescription',
  demo,
  onDirty,
  onBack,
  onExpired,
}: {
  api: ClinicApi;
  entry?: Entry;
  issued?: ClinicDocument;
  kind?: DocumentInput['kind'];
  demo: boolean;
  onDirty: (dirty: boolean) => void;
  onBack: () => void;
  onExpired: () => void;
}): ReactElement {
  const [form, setForm] = useState<DocumentInput>(
    issued?.input ?? {
      entryId: entry?.id ?? '',
      expectedRevision: entry?.revision ?? 0,
      kind,
      issueDate: today(),
      body: '',
      findings: '',
      remarks: '',
      purpose: '',
    },
  );
  const [document, setDocument] = useState<ClinicDocument | null>(
    issued ?? null,
  );
  const [reviewed, setReviewed] = useState(false);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [printerError, setPrinterError] = useState<ClinicError | null>(null);
  const [printersLoading, setPrintersLoading] = useState(true);
  const [printError, setPrintError] = useState<ClinicError | null>(null);
  const [printerId, setPrinterId] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState('');
  const [latestEntry, setLatestEntry] = useState<Entry | null>(null);
  const [reviewError, setReviewError] = useState<ClinicError | null>(null);
  const [headerStatus, setHeaderStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading');
  const [headerAttempt, setHeaderAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(0);
  const paperShell = useRef<HTMLDivElement>(null);
  const [fitPreview, setFitPreview] = useState(true);
  const [paperZoom, setPaperZoom] = useState(1);
  const zoomRef = useRef(1);
  const { busy, error, conflict, run, clearError } = useOperation(onExpired);
  const title = form.kind === 'prescription' ? 'prescription' : 'certificate';
  useEffect(() => (): void => onDirty(false), [onDirty]);
  useEffect(
    () => (): void => {
      window.clearTimeout(copyTimer.current);
    },
    [],
  );
  useEffect(() => {
    const shell = paperShell.current;
    if (!shell) return;
    const measure = (): void => {
      const paper = shell.querySelector<HTMLElement>('.document-paper');
      if (!paper) return;
      const natural = paper.offsetWidth / zoomRef.current;
      const next = Math.min(1, (shell.clientWidth - 32) / natural);
      zoomRef.current = next;
      setPaperZoom(next);
    };
    const frame = requestAnimationFrame((): void => {
      if (!fitPreview) {
        zoomRef.current = 1;
        setPaperZoom(1);
        return;
      }
      measure();
    });
    if (!fitPreview) {
      return (): void => cancelAnimationFrame(frame);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(shell);
    const paper = shell.querySelector('.document-paper');
    if (paper) observer.observe(paper);
    return (): void => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitPreview, document?.status, form.kind]);
  useEffect(() => {
    if (document?.status !== 'issued') return;
    let active = true;
    void api
      .listPrinters()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setPrinters(result.data);
          setPrinterId(
            result.data.find((p) => p.isDefault)?.id ??
              result.data[0]?.id ??
              '',
          );
        } else {
          setPrinterError(result.error);
          if (result.error.code === 'UNAUTHENTICATED') onExpired();
        }
      })
      .catch(() => {
        if (active)
          setPrinterError({
            code: 'UNAVAILABLE',
            message:
              'Unable to list printers. Check the printer connection and select Refresh printers.',
          });
      })
      .finally(() => {
        if (active) setPrintersLoading(false);
      });
    return (): void => {
      active = false;
    };
  }, [api, document?.status, onExpired]);
  function change(key: keyof DocumentInput, value: string): void {
    setForm({ ...form, [key]: value });
    setDocument(null);
    setHeaderStatus('loading');
    setReviewed(false);
    setNotice('');
    onDirty(true);
  }
  async function preview(event: FormEvent): Promise<void> {
    event.preventDefault();
    setReviewed(false);
    const result = await run(() => api.previewDocument(form));
    if (result) setDocument(result);
  }
  async function reviewLatestSource(): Promise<void> {
    setReviewError(null);
    const patientId = entry?.patientId ?? document?.patient.id;
    if (!patientId) return;
    const result = await run(() =>
      api.listEntries({ patientId, discipline: 'medical' }),
    );
    const current = result?.find((e) => e.id === form.entryId);
    if (current) setLatestEntry(current);
    else if (result)
      setReviewError({
        code: 'NOT_FOUND',
        message:
          'Latest consultation is unavailable. Retry the review or return to the chart.',
      });
  }
  async function issue(): Promise<void> {
    if (
      !reviewed ||
      !document ||
      document.status !== 'preview' ||
      headerStatus !== 'ready'
    )
      return;
    const result = await run(() => api.issueDocument(form));
    if (result) {
      setDocument(result);
      onDirty(false);
      setNotice(
        demo
          ? 'Demo document issued in memory.'
          : 'Document issued on the clinic server.',
      );
    }
  }
  async function reloadPrinters(): Promise<void> {
    setPrinters([]);
    setPrinterId('');
    setPrintersLoading(true);
    const result = await run(() => api.listPrinters());
    setPrintersLoading(false);
    if (result) {
      setPrinterError(null);
      setPrinters(result);
      setPrinterId(result.find((p) => p.isDefault)?.id ?? result[0]?.id ?? '');
    }
  }
  async function print(): Promise<void> {
    if (!document?.id || !printerId) return;
    if (headerStatus !== 'ready') return;
    setPrintError(null);
    setNotice('');
    const result = await run(() =>
      api.printDocument({ documentId: document.id ?? '', printerId }),
    );
    setConfirm(false);
    if (result?.submitted)
      setNotice(
        demo
          ? 'Demo print submission simulated. No print job was sent.'
          : 'Sent to printer. Check the printer for the paper output.',
      );
    else if (result)
      setPrintError({
        code: 'UNAVAILABLE',
        message: 'No print job was submitted. Check the printer and retry.',
      });
  }
  async function copyId(): Promise<void> {
    if (!document?.id) return;
    try {
      await navigator.clipboard.writeText(document.id);
      setCopied(true);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }
  return (
    <section>
      <div className="page-heading">
        <h2>
          {document?.status === 'issued' ? 'Issued' : 'Prepare'} {title}
        </h2>
        <Button variant="outline" onClick={onBack}>
          Back to chart
        </Button>
      </div>
      <ErrorNotice error={error ?? reviewError ?? printerError ?? printError}>
        {conflict && (
          <Button variant="outline" onClick={() => void reviewLatestSource()}>
            Review latest consultation
          </Button>
        )}
      </ErrorNotice>
      {latestEntry && (
        <section className="notice">
          <h3>Latest consultation · Revision {latestEntry.revision}</h3>
          <dl className="clinical-content">
            {(
              [
                ['Consultation date', date(latestEntry.consultationDate)],
                [
                  'Age at consultation',
                  latestEntry.ageAtConsultation ?? 'Not recorded',
                ],
                ['CS', latestEntry.cs],
                [
                  'Selected vital signs',
                  latestEntry.vitalsId ?? 'None selected',
                ],
                ['Reason / symptoms', latestEntry.reason],
                ['Findings', latestEntry.findings],
                ['Clinical impression', latestEntry.clinicalImpression],
                ['Plan / instructions', latestEntry.plan],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || 'Not recorded'}</dd>
              </div>
            ))}
          </dl>
          <Corrections original={latestEntry} />
          <Button
            variant="outline"
            onClick={() => {
              setForm({ ...form, expectedRevision: latestEntry.revision });
              setLatestEntry(null);
              clearError();
              setDocument(null);
              setHeaderStatus('loading');
              setReviewed(false);
            }}
          >
            Use latest revision and keep my document text
          </Button>
        </section>
      )}
      {notice && (
        <p className="notice success" role="status">
          {notice}
        </p>
      )}
      <div
        className={`document-workspace ${document?.status === 'issued' ? 'issued-layout' : ''}`}
      >
        {document?.status !== 'issued' && (
          <form
            className="panel form-panel document-editor"
            onSubmit={(e) => void preview(e)}
          >
            <h3>Document details</h3>
            <Field label="Issue date" name="issueDate" error={error}>
              <Input
                disabled={busy}
                id="issueDate"
                type="date"
                value={form.issueDate}
                onChange={(e) => change('issueDate', e.target.value)}
                required
              />
            </Field>
            {form.kind === 'prescription' ? (
              <Field label="Medication instructions" name="body" error={error}>
                <Textarea
                  disabled={busy}
                  id="body"
                  value={form.body}
                  onChange={(e) => change('body', e.target.value)}
                  rows={8}
                  required
                  aria-invalid={Boolean(error?.fieldErrors?.body)}
                  aria-describedby={
                    error?.fieldErrors?.body ? 'body-error' : undefined
                  }
                />
              </Field>
            ) : (
              <>
                <Field
                  label="Findings and clinical impression"
                  name="findings"
                  errorName={error?.fieldErrors?.findings ? 'findings' : 'body'}
                  error={error}
                >
                  <Textarea
                    disabled={busy}
                    id="findings"
                    value={form.findings}
                    onChange={(e) => change('findings', e.target.value)}
                    rows={4}
                  />
                </Field>
                <Field label="Remarks" name="remarks" error={error}>
                  <Textarea
                    disabled={busy}
                    id="remarks"
                    value={form.remarks}
                    onChange={(e) => change('remarks', e.target.value)}
                    rows={3}
                  />
                </Field>
                <Field label="Certificate purpose" name="purpose" error={error}>
                  <Input
                    disabled={busy}
                    id="purpose"
                    value={form.purpose}
                    onChange={(e) => change('purpose', e.target.value)}
                    required
                    aria-invalid={Boolean(error?.fieldErrors?.purpose)}
                    aria-describedby={
                      error?.fieldErrors?.purpose ? 'purpose-error' : undefined
                    }
                  />
                </Field>
              </>
            )}
            <Button
              type="submit"
              disabled={busy || conflict || latestEntry !== null}
            >
              {busy ? 'Preparing…' : `Preview ${title}`}
            </Button>
            {document?.status === 'preview' && (
              <div className="review-controls">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  I have reviewed this document
                </label>
                <Button
                  type="button"
                  disabled={
                    !reviewed ||
                    busy ||
                    conflict ||
                    latestEntry !== null ||
                    headerStatus !== 'ready'
                  }
                  onClick={() => void issue()}
                >
                  Issue {title}
                </Button>
                <p className="hint">
                  Issuance preserves this copy. The signature is handwritten on
                  paper.
                </p>
              </div>
            )}
          </form>
        )}
        <div className="preview-section">
          {document ? (
            <>
              <div className="section-heading">
                <h3>Print preview</h3>
                <div className="segmented">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={fitPreview}
                    onClick={() => setFitPreview(true)}
                  >
                    Fit width
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={!fitPreview}
                    onClick={() => setFitPreview(false)}
                  >
                    100%
                  </Button>
                </div>
                <State status={document.status} />
              </div>
              <div
                className="paper-container"
                tabIndex={0}
                role="region"
                aria-label="Document preview"
                ref={paperShell}
              >
                <div style={{ zoom: fitPreview ? paperZoom : 1 }}>
                  <DocumentPaper
                    key={headerAttempt}
                    document={document}
                    onHeaderStatus={setHeaderStatus}
                  />
                </div>
              </div>
              {headerStatus === 'loading' && (
                <p role="status" className="notice">
                  Loading document header…
                </p>
              )}
              {headerStatus === 'error' && (
                <div role="alert" className="notice error">
                  <p>
                    Document header could not load. Retry before issuing or
                    printing.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setHeaderStatus('loading');
                      setHeaderAttempt((attempt) => attempt + 1);
                    }}
                  >
                    Retry document header
                  </Button>
                </div>
              )}
              {document.status === 'issued' && (
                <section className="panel print-controls">
                  <p className="hint" data-testid="document-id">
                    Document ID: {document.id}
                  </p>
                  {printersLoading && <p role="status">Finding printers…</p>}
                  {!printersLoading &&
                    !printerError &&
                    printers.length === 0 && (
                      <p role="status">
                        No printers found. Connect a printer, then refresh.
                      </p>
                    )}
                  <Field name="printer" label="Printer" error={error}>
                    <select
                      className="clinic-select"
                      disabled={busy}
                      id="printer"
                      value={printerId}
                      onChange={(e) => setPrinterId(e.target.value)}
                    >
                      <option value="">Select a printer</option>
                      {printers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="entry-actions">
                    <Button
                      disabled={
                        busy ||
                        printersLoading ||
                        !printerId ||
                        headerStatus !== 'ready'
                      }
                      onClick={() => {
                        setNotice('');
                        setConfirm(true);
                      }}
                    >
                      Print {title}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || printersLoading}
                      onClick={() => void reloadPrinters()}
                    >
                      Refresh printers
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Copy document ID"
                      onClick={() => void copyId()}
                    >
                      <span className={`swap-icon ${copied ? 'copied' : ''}`}>
                        <svg
                          className="icon-main"
                          aria-hidden="true"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect x="9" y="9" width="12" height="12" rx="2" />
                          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                        </svg>
                        <svg
                          className="icon-alt"
                          aria-hidden="true"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m4 12.5 5 5L20 6.5" />
                        </svg>
                      </span>
                      {copied ? 'Copied' : 'Copy ID'}
                    </Button>
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="empty preview-empty">
              <p>Enter the document details, then preview the {title}.</p>
            </div>
          )}
        </div>
      </div>
      {confirm && (
        <Confirm
          title={`Print ${title}?`}
          action="Confirm print"
          busy={busy}
          onCancel={() => setConfirm(false)}
          onConfirm={() => void print()}
        >
          <p>Printer: {printers.find((p) => p.id === printerId)?.name}</p>
          <p>
            This sends the existing issued document. It does not issue another
            copy.{demo ? ' This demo simulates submission.' : ''}
          </p>
        </Confirm>
      )}
    </section>
  );
}

export function DocumentPaper({
  document,
  onHeaderStatus,
}: {
  document: ClinicDocument;
  onHeaderStatus: (status: 'ready' | 'error') => void;
}): ReactElement {
  const { patient, entry, input, issuer } = document;
  return (
    <article
      className={`document-paper ${input.kind}`}
      data-testid="document-paper"
    >
      <img
        src={headerUrl}
        alt="Supplied Iloilo HMO clinic document header"
        onLoad={(event) => {
          void event.currentTarget
            .decode()
            .then(() => onHeaderStatus('ready'))
            .catch(() => onHeaderStatus('error'));
        }}
        onError={() => onHeaderStatus('error')}
      />
      {document.status === 'preview' && (
        <p className="draft-mark">DRAFT · FOR CLINICIAN REVIEW</p>
      )}
      {input.kind === 'certificate' ? (
        <>
          <h2>MEDICAL CERTIFICATE</h2>
          <div className="paper-date">
            <span>{date(input.issueDate)}</span>
            <small>Date</small>
          </div>
          <h3>TO WHOM IT MAY CONCERN:</h3>
          <p>
            This is to certify that{' '}
            <span className="paper-line">{patient.fullName}</span>,{' '}
            <span className="paper-line">
              {entry.ageAtConsultation ?? '________'}
            </span>{' '}
            years old,{' '}
            <span className="paper-line">
              {patient.sex === 'unknown' ? '________' : patient.sex}
            </span>
            , of{' '}
            <span className="paper-line">{patient.address || '________'}</span>{' '}
            consulted the undersigned on{' '}
            <span className="paper-line">{date(entry.consultationDate)}</span>{' '}
            because of: <span className="paper-line">{entry.reason}</span>.
          </p>
          <div className="paper-writing">
            <h3>Findings and Clinical Impression:</h3>
            <p>{input.findings}</p>
          </div>
          <div className="paper-writing">
            <h3>Remarks:</h3>
            <p>{input.remarks}</p>
          </div>
          <p className="paper-purpose">
            This certification is issued upon the request of the above-named
            person for <span className="paper-line">{input.purpose}</span> and
            not to be used for medico-legal purposes.
          </p>
          {document.restriction && (
            <p className="paper-purpose">{document.restriction}</p>
          )}
        </>
      ) : (
        <>
          <div className="paper-date">
            <span>{date(input.issueDate)}</span>
            <small>Date</small>
          </div>
          <div className="rx-identity">
            <p>
              Name of Patient:{' '}
              <span className="paper-line">{patient.fullName}</span>
            </p>
            <p>
              Age:{' '}
              <span className="paper-line">
                {entry.ageAtConsultation ?? '________'}
              </span>{' '}
              Sex:{' '}
              <span className="paper-line">
                {patient.sex === 'unknown' ? '________' : patient.sex}
              </span>{' '}
              CS: <span className="paper-line">{entry.cs || '________'}</span>
            </p>
            <p>
              Address:{' '}
              <span className="paper-line">
                {patient.address || '________'}
              </span>
            </p>
          </div>
          <p className="rx-symbol">℞</p>
          <p className="rx-body">{input.body}</p>
          {document.followUp && (
            <p className="paper-writing">{document.followUp}</p>
          )}
        </>
      )}
      <footer className="paper-footer">
        <div className="paper-signature">
          <div className="signature-space" />
          <p>
            {issuer.displayName}
            {issuer.role === 'doctor' ? ', M.D.' : ''}
          </p>
          <p>
            LIC#{' '}
            <span className="paper-line">
              {document.licenseText || '________________'}
            </span>
          </p>
          <p>
            PTR#{' '}
            <span className="paper-line">
              {document.ptrText || '________________'}
            </span>
          </p>
        </div>
        {input.kind === 'prescription' && (
          <p className="paper-followup">
            NOTE: If symptoms persist or worsens, follow up immediately with
            your doctor or proceed to the nearest healthcare facility
          </p>
        )}
      </footer>
    </article>
  );
}
