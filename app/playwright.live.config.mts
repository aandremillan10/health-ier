import { defineConfig } from '@playwright/test';

// Serve the actual Electron renderer build; no browser-QA compilation or fixtures.
const port = 5193;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/live-signin.spec.ts',
  workers: 1,
  use: { baseURL, headless: true, channel: 'chrome' },
  webServer: {
    command: `pnpm build && pnpm exec vite preview --outDir out/renderer --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
