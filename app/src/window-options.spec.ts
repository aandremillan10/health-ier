import { describe, expect, it } from 'vitest';
import { createWindowOptions, resolveDevelopmentUrl } from './window-options';

describe('desktop security boundary', () => {
  it('isolates the renderer and points at the bundled sandbox preload', () => {
    const options = createWindowOptions('/app/out/preload/index.cjs');
    expect(options.webPreferences).toMatchObject({
      preload: '/app/out/preload/index.cjs',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    });
  });

  it('accepts only the configured loopback development server', () => {
    expect(resolveDevelopmentUrl(undefined)).toBeUndefined();
    expect(resolveDevelopmentUrl('http://127.0.0.1:5173')).toBe(
      'http://127.0.0.1:5173/',
    );
    for (const url of [
      'https://example.com',
      'http://127.0.0.1:5174/',
      'http://127.0.0.1:5173/other',
      'http://user@127.0.0.1:5173/',
      'file:///etc/passwd',
    ]) {
      expect(() => resolveDevelopmentUrl(url)).toThrow();
    }
  });
});
