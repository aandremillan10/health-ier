import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

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
    baseURL: 'http://127.0.0.1:5175',
    headless: true,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev:renderer',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: !process.env.CI,
  },
});
