import { describe, expect, it, vi } from 'vitest';
import { createPrintService, escapeHtml, type PrintWindow } from './printing';
import { document, ids } from './test-fixtures';
const options = {
  documentId: ids.document,
  printerName: 'Office',
  copies: 1,
  duplexMode: 'simplex',
} as const;
function setup(
  template:
    string | undefined = '<html><head></head><body>trusted</body></html>',
): {
  service: ReturnType<typeof createPrintService>;
  window: PrintWindow;
  create: ReturnType<typeof vi.fn<() => PrintWindow>>;
} {
  const window: PrintWindow = {
    load: vi.fn(async (): Promise<void> => undefined),
    submit: vi.fn(async (): Promise<boolean> => true),
    close: vi.fn(),
  };
  const create = vi.fn(() => window);
  const service = createPrintService(
    async () => [],
    create,
    () => template,
    20,
  );
  return { service, window, create };
}
describe('trusted document print service', () => {
  it('escapes every HTML metacharacter in staff/patient-entered text', () => {
    expect(escapeHtml('<script a="x">&\'')).toBe(
      '&lt;script a=&quot;x&quot;&gt;&amp;&#39;',
    );
  });
  it('loads only local trusted HTML with a denying CSP and closes after confirmed submission', async () => {
    const { service, window } = setup();
    await service.print(document, options, () => true);
    expect(window.load).toHaveBeenCalledWith(
      expect.stringContaining("default-src 'none'; img-src data:"),
    );
    expect(window.submit).toHaveBeenCalledWith(options);
    expect(window.close).toHaveBeenCalledTimes(1);
  });
  it('reports template unavailable without opening a print window', async () => {
    const { service, create } = setup();
    const missing = createPrintService(
      async () => [],
      create,
      () => undefined,
    );
    await expect(
      missing.print(document, options, () => true),
    ).rejects.toMatchObject({ code: 'TEMPLATE_UNAVAILABLE' });
    expect(create).not.toHaveBeenCalled();
    expect(service).toBeDefined();
  });
  it('closes failed, rejected, and timed-out submission windows', async () => {
    for (const submit of [
      async (): Promise<boolean> => false,
      async (): Promise<boolean> => {
        throw new Error('spool error');
      },
      (): Promise<boolean> => new Promise((): void => undefined),
    ]) {
      const { service, window } = setup();
      window.submit = submit;
      await expect(
        service.print(document, options, () => true),
      ).rejects.toMatchObject({ code: 'PRINT_FAILED' });
      expect(window.close).toHaveBeenCalledTimes(1);
    }
  });
  it('cancels active print windows on session reset and never submits after authorization changes during load', async () => {
    const { service, window } = setup();
    let authorized = true;
    window.load = async (): Promise<void> => {
      authorized = false;
      service.cancel();
    };
    await expect(
      service.print(document, options, () => authorized),
    ).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(window.submit).not.toHaveBeenCalled();
    expect(window.close).toHaveBeenCalled();
  });
  it('does not open a window for an already stale session or invalid local template', async () => {
    const { service, create } = setup();
    await expect(
      service.print(document, options, () => false),
    ).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(create).not.toHaveBeenCalled();
    const invalid = setup('<body>missing head</body>');
    await expect(
      invalid.service.print(document, options, () => true),
    ).rejects.toMatchObject({ code: 'PRINT_FAILED' });
    expect(invalid.create).not.toHaveBeenCalled();
  });
});
