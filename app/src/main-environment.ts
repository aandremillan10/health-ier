import { loadEnv } from 'vite';

const mainKeys = [
  'HEALTH_IER_SERVER_URL',
  'HEALTH_IER_ALLOW_SYNTHETIC_HTTP',
] as const;

export function loadMainDevelopmentEnvironment(
  command: 'serve' | 'build',
  mode: string,
  directory: string,
  environment: NodeJS.ProcessEnv = process.env,
): void {
  if (command !== 'serve') return;
  const values = loadEnv(mode, directory, [...mainKeys]);
  for (const key of mainKeys) {
    if (environment[key] === undefined && values[key] !== undefined)
      environment[key] = values[key];
  }
}
