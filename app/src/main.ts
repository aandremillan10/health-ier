import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  net,
  session,
} from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createWindowOptions, resolveDevelopmentUrl } from './window-options';
import { ClinicBroker } from './privileged/broker';
import { operationNames } from './privileged/contracts';
import { createPrintService } from './privileged/printing';
import { renderDocument } from './printing/template';
import { readPickedHistoricalFile } from './privileged/file-picker';
import type { PickedHistoricalFile } from './privileged/historical-selection';

function createWindow(): void {
  const window = new BrowserWindow(
    createWindowOptions(join(__dirname, '../preload/index.cjs')),
  );

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  );
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.once('ready-to-show', () => window.show());

  const developmentUrl = app.isPackaged
    ? undefined
    : resolveDevelopmentUrl(process.env.ELECTRON_RENDERER_URL);

  const rendererFile = join(__dirname, '../renderer/index.html');
  const printer = createPrintService(
    async () =>
      (await window.webContents.getPrintersAsync()).map(
        ({ name, displayName }) => ({ name, displayName }),
      ),
    () => {
      const printSession = session.fromPartition(`print-${randomUUID()}`);
      printSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      printSession.setPermissionCheckHandler(() => false);
      printSession.webRequest.onBeforeRequest((details, callback) =>
        callback({ cancel: !details.url.startsWith('data:') }),
      );
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          session: printSession,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true,
          javascript: false,
          devTools: false,
        },
      });
      printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      printWindow.webContents.on('will-navigate', (event) =>
        event.preventDefault(),
      );
      printWindow.webContents.on('will-attach-webview', (event) =>
        event.preventDefault(),
      );
      return {
        load: async (html: string): Promise<void> => {
          await printWindow.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
          );
        },
        submit: (options): Promise<boolean> =>
          new Promise((resolve) =>
            printWindow.webContents.print(
              {
                silent: true,
                deviceName: options.printerName,
                copies: options.copies,
                duplexMode: options.duplexMode,
                printBackground: true,
              },
              (success) => resolve(success),
            ),
          ),
        close: (): void => {
          if (!printWindow.isDestroyed()) printWindow.destroy();
          void printSession.clearStorageData().catch(() => undefined);
        },
      };
    },
    renderDocument,
  );
  const broker = new ClinicBroker({
    serverUrl: process.env.HEALTH_IER_SERVER_URL ?? 'https://localhost:3000',
    allowSyntheticHttp: process.env.HEALTH_IER_ALLOW_SYNTHETIC_HTTP === 'true',
    packaged: app.isPackaged,
    rendererUrl: developmentUrl ?? pathToFileURL(rendererFile).href,
    senderId: window.webContents.id,
    fetch: (url, options): Promise<Response> => net.fetch(url, options),
    printer,
    historicalFilePicker: {
      pick: async (): Promise<PickedHistoricalFile | null> => {
        const result = await dialog.showOpenDialog(window, {
          title: 'Choose historical patient record',
          properties: ['openFile'],
          filters: [
            {
              name: 'PDF or JPEG historical record',
              extensions: ['pdf', 'jpg', 'jpeg'],
            },
          ],
        });
        if (result.canceled || result.filePaths.length !== 1) return null;
        const picked = await readPickedHistoricalFile(result.filePaths[0]);
        if (picked.mimeType === 'image/jpeg') {
          const image = nativeImage.createFromBuffer(Buffer.from(picked.bytes));
          const size = image.getSize();
          if (image.isEmpty() || size.width * size.height > 40_000_000)
            throw new Error('JPEG image cannot be decoded safely');
        }
        return picked;
      },
    },
    reset: (event): void => {
      if (!window.isDestroyed() && !window.webContents.isDestroyed())
        window.webContents.send('clinic:session-reset', event);
    },
  });
  for (const name of operationNames) {
    ipcMain.removeHandler(`clinic:${name}`);
    ipcMain.handle(`clinic:${name}`, (event, payload: unknown) =>
      broker.invoke(name, payload, {
        senderId: event.sender.id,
        isMainFrame: event.senderFrame === window.webContents.mainFrame,
        url: event.senderFrame?.url ?? '',
      }),
    );
  }
  window.once('closed', () => {
    broker.clear('window-closed');
    for (const name of operationNames) ipcMain.removeHandler(`clinic:${name}`);
  });
  const load = developmentUrl
    ? window.loadURL(developmentUrl)
    : window.loadFile(rendererFile);

  void load.catch((error: unknown) => {
    console.error('Unable to load the desktop shell.', error);
    app.quit();
  });
}

void app
  .whenReady()
  .then(createWindow)
  .catch((error: unknown) => {
    console.error('Unable to start the desktop shell.', error);
    app.quit();
  });

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
