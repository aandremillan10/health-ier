import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type {
  HistoricalDiscipline,
  HistoricalDocument,
  HistoricalSelection,
} from '../../shared/historical-documents-api';
import { historicalFileLimit } from '../../shared/historical-documents-api';
import type { ClinicApi, ClinicError, Patient, Principal } from './contract';
import { visibleDisciplines } from './contract';
import { ErrorNotice, Field, Loading } from './ui';
import { date, timestamp, today } from './format';
import './historical-documents.css';
import { checkJpegDimensions, decodeScan } from './scan-preview';

export function HistoricalDocuments({
  api,
  patient,
  staff,
  practice = false,
  onExpired,
  onDirty,
}: {
  api: ClinicApi;
  patient: Patient;
  staff: Principal;
  practice?: boolean;
  onExpired: () => void;
  onDirty: (dirty: boolean) => void;
}): ReactElement {
  const ownDiscipline =
    staff.role === 'doctor'
      ? 'medical'
      : staff.role === 'dentist'
        ? 'dental'
        : staff.role === 'medtech'
          ? 'laboratory'
          : null;
  const [discipline, setDiscipline] = useState<HistoricalDiscipline | ''>('');
  const [documents, setDocuments] = useState<HistoricalDocument[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<ClinicError | null>(null);
  const [busy, setBusy] = useState(true);
  const [editor, setEditor] = useState(false);
  const [selection, setSelection] = useState<HistoricalSelection | null>(null);
  const [replacement, setReplacement] = useState<HistoricalDocument | null>(
    null,
  );
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<{
    document: HistoricalDocument;
    contentBase64?: string;
  } | null>(null);
  const sequence = useRef(0);
  const active = useRef(true);
  const previewOrigin = useRef<HTMLButtonElement | null>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const token = selection?.token;
    return (): void => {
      if (token)
        void api
          .discardHistoricalFile({ selectionToken: token })
          .catch(() => undefined);
    };
  }, [api, selection]);
  useEffect(() => {
    const requests = sequence;
    active.current = true;
    return (): void => {
      active.current = false;
      requests.current++;
    };
  }, []);
  const fail = useCallback(
    (failure: ClinicError): void => {
      setError(failure);
      if (failure.code === 'UNAUTHENTICATED') onExpired();
    },
    [onExpired],
  );
  const load = useCallback(
    (nextCursor?: string): Promise<void> => {
      const request = ++sequence.current;
      return api
        .listHistoricalDocuments({
          patientId: patient.id,
          ...(discipline ? { discipline } : {}),
          ...(nextCursor ? { cursor: nextCursor } : {}),
        })
        .then((result) => {
          if (!active.current || sequence.current !== request) return;
          if (result.ok) {
            setError(null);
            setDocuments((previous) =>
              nextCursor
                ? [...(previous ?? []), ...result.data.documents]
                : result.data.documents,
            );
            setCursor(result.data.nextCursor);
          } else fail(result.error);
        })
        .catch(() => {
          if (active.current && sequence.current === request)
            fail({
              code: 'UNAVAILABLE',
              message:
                'Historical documents could not load. Keep your input and retry the list.',
            });
        })
        .finally(() => {
          if (active.current && sequence.current === request) setBusy(false);
        });
    },
    [api, patient.id, discipline, fail],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    onDirty(editor);
  }, [editor, onDirty]);
  function refresh(nextCursor?: string): void {
    setBusy(true);
    setError(null);
    void load(nextCursor);
  }
  async function choose(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSelection(null);
    try {
      const result = await api.selectHistoricalFile({ patientId: patient.id });
      if (!active.current) return;
      if (result.ok) {
        if (
          result.data.selection &&
          result.data.selection.patientId !== patient.id
        )
          fail({
            code: 'DENIED',
            message:
              'The selected file could not be associated with this patient. Choose it again.',
          });
        else setSelection(result.data.selection);
      } else fail(result.error);
    } catch {
      if (active.current)
        fail({
          code: 'UNAVAILABLE',
          message: 'The file could not be selected. Try choosing it again.',
        });
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function cancel(): Promise<void> {
    if (selection)
      await api
        .discardHistoricalFile({ selectionToken: selection.token })
        .catch(() => undefined);
    if (!active.current) return;
    setEditor(false);
    setSelection(null);
    setReplacement(null);
    setError(null);
  }
  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selection || !ownDiscipline || busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const result = await api.importHistoricalDocument({
        patientId: patient.id,
        selectionToken: selection.token,
        discipline: ownDiscipline,
        documentType: String(form.get('documentType') ?? '').trim(),
        documentDate: String(form.get('documentDate') ?? ''),
        description: String(form.get('description') ?? '').trim(),
        ...(replacement
          ? {
              replacesId: replacement.id,
              replacementReason: String(
                form.get('replacementReason') ?? '',
              ).trim(),
            }
          : {}),
      });
      if (!active.current) return;
      if (result.ok) {
        setEditor(false);
        setSelection(null);
        setReplacement(null);
        onDirty(false);
        setNotice(
          practice
            ? 'Practice scan imported in memory. No file was read or stored.'
            : 'Historical document saved on this clinic server. The original file is preserved. Cloud delivery does not block clinic work.',
        );
        await load();
      } else fail(result.error);
    } catch {
      if (active.current)
        fail({
          code: 'UNAVAILABLE',
          message:
            'Import was not confirmed. Keep the document details and retry. You may need to choose the file again if the selection expired.',
        });
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function open(
    record: HistoricalDocument,
    button: HTMLButtonElement,
  ): Promise<void> {
    if (busy) return;
    previewOrigin.current = button;
    setBusy(true);
    setError(null);
    const request = ++sequence.current;
    try {
      const result = practice
        ? await api.readHistoricalDocument({
            patientId: patient.id,
            id: record.id,
          })
        : await api.readHistoricalDocumentContent({
            patientId: patient.id,
            id: record.id,
          });
      if (!active.current || request !== sequence.current) return;
      if (!result.ok) {
        fail(result.error);
        return;
      }
      const content =
        'document' in result.data ? result.data : { document: result.data };
      if (
        content.document.patientId !== patient.id ||
        content.document.id !== record.id ||
        content.document.byteLength > historicalFileLimit
      ) {
        fail({
          code: 'DENIED',
          message:
            'The requested document could not be confirmed. Refresh the list.',
        });
        return;
      }
      setPreview(content);
    } catch {
      if (active.current && request === sequence.current)
        fail({
          code: 'UNAVAILABLE',
          message:
            'This document could not open. Retry the preview; the original remains stored.',
        });
    } finally {
      if (active.current && request === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (preview) previewHeading.current?.focus();
  }, [preview]);
  if (!visibleDisciplines(staff).length)
    return <p>Your account cannot access historical clinical documents.</p>;
  return (
    <section className="historical-documents" aria-label="Historical documents">
      <div className="page-heading">
        <div>
          <h2>Historical documents</h2>
          <p className="hint">
            Original PDF and JPEG scans, attached to this patient and
            discipline. Scans do not create authored chart entries.
          </p>
        </div>
        {ownDiscipline && !editor && (
          <Button
            onClick={() => {
              setEditor(true);
              setPreview(null);
              setNotice('');
            }}
          >
            Import historical document
          </Button>
        )}
      </div>
      <ErrorNotice error={error}>
        <Button variant="outline" disabled={busy} onClick={() => refresh()}>
          Retry document list
        </Button>
      </ErrorNotice>
      {notice && (
        <p role="status" className="notice success">
          {notice}
        </p>
      )}
      {editor && (
        <form
          className="panel form-panel"
          onSubmit={(event) => void save(event)}
          aria-busy={busy}
        >
          <h3>
            {replacement
              ? 'Import replacement scan'
              : 'Import historical document'}
          </h3>
          <p className="hint">
            {patient.fullName} · {patient.id} · {ownDiscipline}. PDF or JPEG, up
            to 10 MiB. Choose an existing scanned file; scanner hardware is not
            controlled here.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void choose()}
          >
            {practice
              ? 'Choose fictional scan'
              : selection
                ? 'Choose another file'
                : 'Choose scanned file'}
          </Button>
          {selection && (
            <p role="status">
              Selected: {selection.filename} ·{' '}
              {Math.ceil(selection.byteLength / 1024)} KiB
            </p>
          )}
          <div className="form-grid">
            <Field
              label="Document type"
              name="history-type"
              error={error}
              errorName="documentType"
            >
              <Input
                id="history-type"
                name="documentType"
                required
                maxLength={80}
                disabled={busy}
                defaultValue={replacement?.documentType ?? ''}
              />
            </Field>
            <Field
              label="Document date"
              name="history-date"
              error={error}
              errorName="documentDate"
            >
              <Input
                id="history-date"
                name="documentDate"
                type="date"
                required
                max={today()}
                disabled={busy}
                defaultValue={replacement?.documentDate ?? today()}
              />
            </Field>
          </div>
          <Field
            label="Description"
            name="history-description"
            error={error}
            errorName="description"
          >
            <Textarea
              id="history-description"
              name="description"
              required
              maxLength={2000}
              disabled={busy}
              defaultValue={replacement?.description ?? ''}
            />
          </Field>
          {replacement && (
            <>
              <p className="notice">
                Original preserved: {replacement.documentType} ·{' '}
                {date(replacement.documentDate)}. This creates a linked
                replacement; the original remains available.
              </p>
              <Field
                label="Reason for replacement"
                name="history-reason"
                error={error}
                errorName="replacementReason"
              >
                <Textarea
                  id="history-reason"
                  name="replacementReason"
                  required
                  maxLength={2000}
                  disabled={busy}
                />
              </Field>
            </>
          )}
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Cancel import
            </Button>
            <Button disabled={busy || !selection} type="submit">
              {busy ? 'Importing…' : 'Save historical document'}
            </Button>
          </div>
        </form>
      )}
      {!editor && (
        <div className="history-filters">
          <Field label="Document discipline" name="history-discipline">
            <select
              id="history-discipline"
              className="clinic-select"
              disabled={busy}
              value={discipline}
              onChange={(event) => {
                setDiscipline(event.target.value as HistoricalDiscipline | '');
                setBusy(true);
                setDocuments(null);
                setPreview(null);
              }}
            >
              <option value="">All permitted disciplines</option>
              {visibleDisciplines(staff).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>
          <Button variant="outline" disabled={busy} onClick={() => refresh()}>
            Refresh historical documents
          </Button>
        </div>
      )}
      {busy && <Loading>Loading historical document…</Loading>}
      {documents?.length === 0 && (
        <p className="empty">
          No historical scans in this view.
          {ownDiscipline
            ? ' Select Import historical document to attach an existing PDF or JPEG.'
            : ' Only authorized clinical staff can import scans.'}
        </p>
      )}
      <ul className="history-list">
        {documents?.map((record) => (
          <li className="panel" key={record.id}>
            <div className="section-heading">
              <h3>
                {record.documentType} · {date(record.documentDate)}
              </h3>
              <span className="badge">{record.discipline}</span>
            </div>
            <p>{record.description}</p>
            <p className="hint">
              {record.filename} · {Math.ceil(record.byteLength / 1024)} KiB ·
              Imported by {record.uploaderName} on {timestamp(record.createdAt)}
            </p>
            {record.replacesId && (
              <p className="notice">
                Replacement of {record.replacesId}. Reason:{' '}
                {record.replacementReason}
              </p>
            )}
            <div className="entry-actions">
              <Button
                variant="outline"
                disabled={busy || editor}
                onClick={(event) => void open(record, event.currentTarget)}
              >
                View original scan
              </Button>
              {record.discipline === ownDiscipline &&
                record.uploaderId === staff.id && (
                  <Button
                    variant="outline"
                    disabled={busy || editor}
                    onClick={() => {
                      setReplacement(record);
                      setEditor(true);
                      setPreview(null);
                      setSelection(null);
                    }}
                  >
                    Import replacement
                  </Button>
                )}
            </div>
            {record.discipline === ownDiscipline &&
              record.uploaderId !== staff.id && (
                <p className="hint">
                  Only the original uploader can import a replacement. This scan
                  remains read-only for your account.
                </p>
              )}
          </li>
        ))}
      </ul>
      {cursor && (
        <Button
          variant="outline"
          disabled={busy || editor}
          onClick={() => refresh(cursor)}
        >
          Load more historical documents
        </Button>
      )}
      {preview && (
        <section
          className="panel historical-preview"
          aria-label="Original scan preview"
        >
          <div className="section-heading">
            <h3 ref={previewHeading} tabIndex={-1}>
              {preview.document.documentType} · Original scan
            </h3>
            <Button
              variant="outline"
              onClick={() => {
                setPreview(null);
                previewOrigin.current?.focus();
              }}
            >
              Close scan preview
            </Button>
          </div>
          <p className="hint">
            {preview.document.filename} · {preview.document.uploaderName}.
            Original bytes remain unchanged.
          </p>
          {practice ? (
            <div className="practice-scan">
              <h4>FICTIONAL HISTORICAL SCAN</h4>
              <p>Practice patient: Lina Marquez · DEMO-0001</p>
              <p>
                This represents a scanned document. No file picker, file
                content, PDF worker, download, or printer is used.
              </p>
            </div>
          ) : (
            preview.contentBase64 && (
              <ScanPreview
                key={preview.document.id}
                document={preview.document}
                contentBase64={preview.contentBase64}
              />
            )
          )}
        </section>
      )}
    </section>
  );
}

function ScanPreview({
  document: record,
  contentBase64,
}: {
  document: HistoricalDocument;
  contentBase64: string;
}): ReactElement {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [image, setImage] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    let task: { destroy: () => Promise<void> } | null = null;
    async function load(): Promise<void> {
      try {
        const bytes = decodeScan(contentBase64, record.byteLength);
        if (record.mimeType === 'image/jpeg') {
          checkJpegDimensions(bytes);
          const blob = new Blob([bytes], { type: 'image/jpeg' });
          const bitmap = await createImageBitmap(blob);
          const pixels = bitmap.width * bitmap.height;
          bitmap.close();
          if (pixels > 24_000_000)
            throw new Error('This image exceeds the safe preview size.');
          if (active) {
            setImage(`data:image/jpeg;base64,${contentBase64}`);
            setLoading(false);
          }
          return;
        }
        const [pdfjs] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs'),
        ]);
        if (!active) return;
        // The bundled module registers PDF.js's local handler. PDF.js uses its
        // loopback port instead of creating a blob Worker for file:// origins.
        // Parsing is in-process, bounded by the file/page/image limits below.
        // PDF.js 6 has no eval option. CSP disallows eval; no scripting or annotation layer is mounted.
        const loadingTask = pdfjs.getDocument({
          data: bytes,
          disableAutoFetch: true,
          disableStream: true,
          useWorkerFetch: false,
          useWasm: false,
          enableXfa: false,
          disableFontFace: true,
          isOffscreenCanvasSupported: false,
          maxImageSize: 8_000_000,
          stopAtErrors: true,
        });
        task = loadingTask;
        const loaded = await loadingTask.promise;
        if (!active) {
          await loadingTask.destroy();
          return;
        }
        if (loaded.numPages > 200)
          throw new Error(
            'This PDF has more than 200 pages and cannot be previewed here.',
          );
        setPdf(loaded);
      } catch (failure) {
        if (active) {
          setError(
            failure instanceof Error
              ? failure.message
              : 'Scan preview failed. Close and reopen the scan to retry.',
          );
          setLoading(false);
        }
      }
    }
    void load();
    return (): void => {
      active = false;
      if (task) void task.destroy();
    };
  }, [contentBase64, record]);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let render: RenderTask | null = null;
    void pdf
      .getPage(page)
      .then(async (source) => {
        if (!active || !canvas.current) return;
        const original = source.getViewport({ scale: 1 });
        const scale = Math.min(
          1.5,
          Math.sqrt(8_000_000 / (original.width * original.height)),
          4096 / original.width,
          4096 / original.height,
        );
        const viewport = source.getViewport({ scale });
        const element = canvas.current;
        element.width = Math.ceil(viewport.width);
        element.height = Math.ceil(viewport.height);
        render = source.render({ canvas: element, viewport });
        await render.promise;
        if (active) setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError(
            'This PDF page could not render. Close the preview and try again.',
          );
          setLoading(false);
        }
      });
    return (): void => {
      active = false;
      render?.cancel();
    };
  }, [pdf, page]);
  return (
    <div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {loading && <p role="status">Preparing a safe scan preview…</p>}
      {image && (
        <img
          className="scan-image"
          src={image}
          alt={`Original ${record.documentType} scan dated ${record.documentDate}`}
        />
      )}
      {pdf && (
        <>
          <div className="entry-actions">
            <Button
              variant="outline"
              disabled={page === 1 || loading}
              onClick={() => {
                setLoading(true);
                setPage((value) => value - 1);
              }}
            >
              Previous page
            </Button>
            <span aria-live="polite">
              Page {page} of {pdf.numPages}
            </span>
            <Button
              variant="outline"
              disabled={page === pdf.numPages || loading}
              onClick={() => {
                setLoading(true);
                setPage((value) => value + 1);
              }}
            >
              Next page
            </Button>
          </div>
          <canvas
            ref={canvas}
            className="scan-canvas"
            aria-label={`Original scanned document, page ${page}. Scans may not contain accessible text.`}
            role="img"
          />
          <p className="hint">
            Read-only page image. Embedded links, scripts, forms, downloads, and
            printing are unavailable in this preview.
          </p>
        </>
      )}
    </div>
  );
}
