import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi, SessionReset } from '../shared/clinic-api';
const electron = vi.hoisted(() => ({
  expose: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electron.expose },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.remove,
  },
}));
describe('sandbox preload surface', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  it('exposes only typed named operations and hides IPC/network/token/persistence primitives', async () => {
    await import('./index');
    const api = electron.expose.mock.calls[0]?.[1] as DesktopApi;
    expect(electron.expose.mock.calls[0]?.[0]).toBe('desktop');
    expect(Object.isFrozen(api)).toBe(true);
    expect(Object.isFrozen(api.clinic)).toBe(true);
    for (const name of [
      'ipcRenderer',
      'invoke',
      'send',
      'fetch',
      'token',
      'storage',
      'shell',
      'printHtml',
    ]) {
      expect(api).not.toHaveProperty(name);
      expect(api.clinic).not.toHaveProperty(name);
    }
    electron.invoke.mockResolvedValue({ ok: true, data: {} });
    await api.clinic.readDocument({ id: 'synthetic-id' });
    expect(electron.invoke).toHaveBeenCalledWith('clinic:readDocument', {
      id: 'synthetic-id',
    });
  });
  it('delivers only session-reset data and returns an exact unsubscribe function', async () => {
    await import('./index');
    const api = electron.expose.mock.calls[0]?.[1] as DesktopApi;
    const listener = vi.fn();
    const unsubscribe = api.clinic.onSessionReset(listener);
    const handler = electron.on.mock.calls[0]?.[1] as (
      event: unknown,
      reset: SessionReset,
    ) => void;
    const reset: SessionReset = { generation: 2, reason: 'logout' };
    handler({ sender: 'privileged raw event' }, reset);
    expect(listener).toHaveBeenCalledExactlyOnceWith(reset);
    unsubscribe();
    expect(electron.remove).toHaveBeenCalledWith(
      'clinic:session-reset',
      handler,
    );
  });
});
