import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { createWindowOptions, resolveDevelopmentUrl } from './window-options';

function createWindow(): void {
  const window = new BrowserWindow(
    createWindowOptions(join(__dirname, '../preload/index.cjs')),
  );

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.once('ready-to-show', () => window.show());

  const developmentUrl = app.isPackaged
    ? undefined
    : resolveDevelopmentUrl(process.env.ELECTRON_RENDERER_URL);

  const load = developmentUrl
    ? window.loadURL(developmentUrl)
    : window.loadFile(join(__dirname, '../renderer/index.html'));

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
