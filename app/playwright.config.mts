import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

const port = Number(process.env.CLINIC_FRONTEND_PORT ?? 5175);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('CLINIC_FRONTEND_PORT must be a port from 1024 to 65535.');
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: resolve(import.meta.dirname, '../../test-results'),
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: resolve(
          import.meta.dirname,
          '../../verification/frontend-results.json',
        ),
      },
    ],
  ],
  use: {
    baseURL,
    headless: true,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm dev:renderer --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
});
