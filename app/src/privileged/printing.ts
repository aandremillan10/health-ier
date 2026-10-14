import type { IssuedDocument, Printer, PrintInput } from '../shared/clinic-api';
import { BoundaryError, type PrintService } from './broker';

export interface PrintWindow {
  load: (html: string) => Promise<void>;
  submit: (options: PrintInput) => Promise<boolean>;
  close: () => void;
}
export type DocumentTemplate = (document: IssuedDocument) => string | undefined;
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ] ?? character,
  );
}
export function createPrintService(
  listPrinters: () => Promise<Printer[]>,
  createWindow: () => PrintWindow,
  renderDocument: DocumentTemplate,
  timeoutMs = 30000,
): PrintService {
  const active = new Map<PrintWindow, { cancelled: boolean }>();
  return {
    listPrinters,
    cancel: (): void => {
      for (const [window, state] of active) {
        state.cancelled = true;
        window.close();
      }
    },
    print: async (document, options, stillAuthorized): Promise<void> => {
      if (!stillAuthorized())
        throw new BoundaryError('SESSION_CHANGED', 'Session changed');
      const html = renderDocument(document);
      if (html === undefined)
        throw new BoundaryError('TEMPLATE_UNAVAILABLE', 'Template unavailable');
      if (html.length > 10_000_000 || !/<head(?:\s[^>]*)?>/i.test(html))
        throw new BoundaryError('PRINT_FAILED', 'Invalid trusted template');
      const window = createWindow();
      const state = { cancelled: false };
      active.set(window, state);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const work = async (): Promise<void> => {
          const securedHtml = html.replace(
            /<head(?:\s[^>]*)?>/i,
            "$&<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">",
          );
          await window.load(securedHtml);
          if (state.cancelled || !stillAuthorized())
            throw new BoundaryError('SESSION_CHANGED', 'Session changed');
          if (!(await window.submit(options)))
            throw new BoundaryError('PRINT_FAILED', 'Submission failed');
        };
        await Promise.race([
          work(),
          new Promise<never>((_resolve, reject): void => {
            timer = setTimeout(() => {
              state.cancelled = true;
              reject(new BoundaryError('PRINT_FAILED', 'Printer timed out'));
            }, timeoutMs);
          }),
        ]);
      } catch (error: unknown) {
        if (error instanceof BoundaryError) throw error;
        throw new BoundaryError('PRINT_FAILED', 'Printer failed');
      } finally {
        state.cancelled = true;
        if (timer) clearTimeout(timer);
        active.delete(window);
        window.close();
      }
    },
  };
}
