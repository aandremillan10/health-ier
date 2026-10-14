import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadMainDevelopmentEnvironment } from './main-environment';
import { serverOrigin } from './privileged/broker';

const directories: string[] = [];
function fixture(): string {
  const directory = mkdtempSync(join(tmpdir(), 'healthier-main-env-'));
  directories.push(directory);
  writeFileSync(
    join(directory, '.env'),
    [
      'HEALTH_IER_SERVER_URL=http://127.0.0.1:3002',
      'HEALTH_IER_ALLOW_SYNTHETIC_HTTP=true',
      'DATABASE_URL=must-never-enter-client-config',
      'MIRROR_MACHINE_TOKEN=must-never-enter-client-config',
      'VITE_PRIVATE_VALUE=must-never-be-projected',
      'HEALTH_IER_SERVER_URL_EXTRA=must-never-be-projected',
    ].join('\n'),
  );
  vi.stubEnv('HEALTH_IER_SERVER_URL', undefined);
  vi.stubEnv('HEALTH_IER_ALLOW_SYNTHETIC_HTTP', undefined);
  return directory;
}
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    for (const name of ['.env', '.env.development.local'])
      rmSync(join(directory, name), { force: true });
    rmdirSync(directory);
  }
});
describe('main-process development environment', () => {
  it('loads the actual app env file and only two exact main settings', () => {
    const environment: NodeJS.ProcessEnv = {};
    loadMainDevelopmentEnvironment(
      'serve',
      'development',
      fixture(),
      environment,
    );
    expect(environment).toEqual({
      HEALTH_IER_SERVER_URL: 'http://127.0.0.1:3002',
      HEALTH_IER_ALLOW_SYNTHETIC_HTTP: 'true',
    });
    expect(
      serverOrigin(
        environment.HEALTH_IER_SERVER_URL!,
        environment.HEALTH_IER_ALLOW_SYNTHETIC_HTTP === 'true',
        false,
      ),
    ).toBe('http://127.0.0.1:3002');
    expect(() =>
      serverOrigin(environment.HEALTH_IER_SERVER_URL!, true, true),
    ).toThrow();
  });
  it('preserves explicit shell settings over env-file and mode-local settings', () => {
    const directory = fixture();
    writeFileSync(
      join(directory, '.env.development.local'),
      'HEALTH_IER_SERVER_URL=https://mode-file.example',
    );
    const environment: NodeJS.ProcessEnv = {
      HEALTH_IER_SERVER_URL: 'https://trusted-shell.example',
      HEALTH_IER_ALLOW_SYNTHETIC_HTTP: 'false',
    };
    loadMainDevelopmentEnvironment(
      'serve',
      'development',
      directory,
      environment,
    );
    expect(environment).toEqual({
      HEALTH_IER_SERVER_URL: 'https://trusted-shell.example',
      HEALTH_IER_ALLOW_SYNTHETIC_HTTP: 'false',
    });
  });
  it('uses Vite mode-local precedence when no explicit override exists', () => {
    const directory = fixture();
    writeFileSync(
      join(directory, '.env.development.local'),
      'HEALTH_IER_SERVER_URL=https://mode-file.example',
    );
    const environment: NodeJS.ProcessEnv = {};
    loadMainDevelopmentEnvironment(
      'serve',
      'development',
      directory,
      environment,
    );
    expect(environment.HEALTH_IER_SERVER_URL).toBe('https://mode-file.example');
  });
  it('never embeds development env settings during build', () => {
    const environment: NodeJS.ProcessEnv = {};
    loadMainDevelopmentEnvironment(
      'build',
      'production',
      fixture(),
      environment,
    );
    expect(environment).toEqual({});
  });
});
