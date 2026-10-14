import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { _electron, expect } from '@playwright/test';
import type { ElectronApplication, Page, Locator } from '@playwright/test';

// Real local E2E; failures include correction payload rejection, lost saved data,
// wrong author access and issued snapshots changing after a client restart.
const appDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.loadEnvFile(resolve(appDirectory, '.env'));
const requireServer = createRequire(
  resolve(appDirectory, '../server/package.json'),
);
const serverEnvironment = requireServer('dotenv').parse(
  await readFile(resolve(appDirectory, '../server/.env'), 'utf8'),
) as Record<string, string>;
const databaseUrl = new URL(serverEnvironment.DATABASE_URL);
const serverUrl = new URL(process.env.HEALTH_IER_SERVER_URL ?? '');
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(databaseUrl.hostname) &&
    /^\/healthier_demo_[a-z0-9_]+$/.test(databaseUrl.pathname) &&
    serverEnvironment.SERVER_MODE === 'EDGE',
  'Integration requires a dedicated loopback synthetic EDGE database',
);
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(serverUrl.hostname) &&
    serverUrl.protocol === 'http:' &&
    serverUrl.port === (serverEnvironment.PORT ?? '3000'),
  'Client and local test API settings must match',
);
const privateFile: unknown = JSON.parse(
  await readFile(
    resolve(
      appDirectory,
      '../server',
      serverEnvironment.DEMO_CREDENTIALS_FILE ??
        '../.private/demo-credentials.json',
    ),
    'utf8',
  ),
);
assert.ok(
  privateFile &&
    typeof privateFile === 'object' &&
    'accounts' in privateFile &&
    Array.isArray(privateFile.accounts),
  'Invalid private account file',
);
const credentials = privateFile.accounts.map(
  (value: unknown): { username: string; password: string } => {
    assert.ok(
      value &&
        typeof value === 'object' &&
        'username' in value &&
        typeof value.username === 'string' &&
        'password' in value &&
        typeof value.password === 'string',
      'Invalid private account',
    );
    return { username: value.username, password: value.password };
  },
);
const evidence = resolve(appDirectory, '../../verification');
await mkdir(evidence, { recursive: true });
const bootstrap = resolve(evidence, 'electron-integration-bootstrap.cjs');
await writeFile(
  bootstrap,
  `const { BrowserWindow } = require('electron');\nBrowserWindow.prototype.show = function () {};\nrequire(${JSON.stringify(resolve(appDirectory, 'out/main/index.cjs'))});\n`,
);
const require = createRequire(import.meta.url);
const environment: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) environment[key] = value;
}
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.ELECTRON_RENDERER_URL;
let application: ElectronApplication | undefined;
let page!: Page;
const name = `Synthetic AMLIG Integration ${randomUUID().slice(0, 8)}`;
const results: string[] = [];
let patientId: string | undefined;
let prescriptionId: string | undefined;
let certificateId: string | undefined;
const errors: string[] = [];
async function start(): Promise<void> {
  application = await _electron.launch({
    executablePath: require('electron'),
    args: [bootstrap],
    cwd: appDirectory,
    env: environment,
  });
  page = await application.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(
    page.getByRole('heading', { name: 'Staff sign-in' }),
  ).toBeVisible();
  assert.equal(
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().every((window) => !window.isVisible()),
    ),
    true,
  );
  assert.deepEqual(await page.evaluate(() => window.desktop.clinic.health()), {
    ok: true,
    data: { status: 'ok', mode: 'EDGE' },
  });
}
async function login(username: string): Promise<void> {
  const account = credentials.find((row) => row.username === username);
  assert.ok(account, 'Missing private synthetic account');
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Patient records', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.topbar')).toContainText('Clinic LAN');
}
async function logout(): Promise<void> {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Staff sign-in' }),
  ).toBeVisible();
  await expect(page.locator('.patient-banner')).toHaveCount(0);
}
async function openPatient(): Promise<void> {
  await page.getByLabel('Find a patient').fill(name);
  await page.getByRole('button', { name: 'Find patient', exact: true }).click();
  await page
    .getByRole('button', { name: `Open ${name} ${patientId}`, exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function finalize(record: Locator): Promise<void> {
  await record
    .getByRole('button', { name: 'Finalize entry', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm finalization', exact: true })
    .click();
  await expect(record).toContainText('Finalized');
}
async function issue(
  kind: 'prescription' | 'certificate',
  content: string,
): Promise<string> {
  await page
    .getByTestId('entry')
    .getByRole('button', { name: `Prepare ${kind}`, exact: true })
    .click();
  if (kind === 'prescription')
    await page.getByLabel('Medication instructions').fill(content);
  else {
    await page.getByLabel('Findings and clinical impression').fill(content);
    await page
      .getByLabel('Certificate purpose')
      .fill('Synthetic integration verification');
  }
  await page
    .getByRole('button', { name: `Preview ${kind}`, exact: true })
    .click();
  await expect(page.getByTestId('document-paper')).toContainText(content);
  await page.getByLabel('I have reviewed this document').check();
  await page
    .getByRole('button', { name: `Issue ${kind}`, exact: true })
    .click();
  await expect(page.getByTestId('document-id')).toBeVisible();
  const id = (await page.getByTestId('document-id').innerText())
    .replace('Document ID: ', '')
    .trim();
  assert.match(id, /^[0-9a-f-]{36}$/);
  await page
    .getByRole('button', { name: 'Back to chart', exact: true })
    .click();
  return id;
}
try {
  await start();
  await login('demo.clerk');
  await page
    .getByRole('button', { name: 'Register patient', exact: true })
    .click();
  await page.getByLabel('Full name', { exact: true }).fill(name);
  await page
    .getByLabel('Birth date (optional)', { exact: true })
    .fill('1990-01-01');
  await page
    .getByRole('button', { name: 'Check existing records', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  patientId = (await page.locator('.patient-banner p').innerText()).split(
    ' · ',
  )[0];
  assert.match(patientId, /^[0-9a-f-]{36}$/);
  await expect(
    page.getByRole('button', { name: 'Medical chart', exact: true }),
  ).toHaveCount(0);
  results.push(
    'Clerk creates a persisted identity; provider navigation remains restricted',
  );
  await logout();
  await login('demo.attendant');
  await openPatient();
  await page.getByRole('button', { name: 'Vital signs', exact: true }).click();
  await page
    .getByRole('button', { name: 'Record vital signs', exact: true })
    .click();
  await page.locator('#systolic').fill('120');
  await page.locator('#diastolic').fill('80');
  await page.locator('#pulse').fill('70');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const vital = page.getByTestId('vitals');
  await expect(vital).toContainText('Not taken');
  await finalize(vital);
  await vital
    .getByRole('button', { name: 'Add correction', exact: true })
    .click();
  await page
    .getByLabel('Correction reason', { exact: true })
    .fill('Synthetic measurement transcription');
  await page.locator('#pulse').fill('71');
  await page
    .getByRole('button', { name: 'Save correction', exact: true })
    .click();
  await expect(vital).toContainText('Synthetic measurement transcription');
  await expect(vital.locator('.corrections')).toContainText('71');
  results.push(
    'Attendant reads the shared identity, saves nullable vitals, finalizes and adds a preserved correction',
  );
  await logout();
  await login('demo.doctor');
  await openPatient();
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'New medical entry', exact: true })
    .click();
  await expect(page.locator('#vitalsId option')).toHaveCount(2);
  const options = await page.locator('#vitalsId option').allTextContents();
  assert.equal(
    options.length,
    2,
    'Finalized same-patient measurements are available',
  );
  await page.locator('#vitalsId').selectOption({ index: 1 });
  await page
    .getByLabel('Reason / symptoms', { exact: true })
    .fill('Synthetic integration visit');
  await page
    .getByLabel('Findings', { exact: true })
    .fill('Synthetic original findings');
  await page
    .getByLabel('Plan / instructions', { exact: true })
    .fill('Synthetic original plan');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const entry = page.getByTestId('entry');
  await expect(entry).toContainText('Synthetic original findings');
  await finalize(entry);
  await entry
    .getByRole('button', { name: 'Add correction', exact: true })
    .click();
  await page
    .getByLabel('Correction reason', { exact: true })
    .fill('Synthetic clinical transcription');
  await page
    .getByLabel('Findings', { exact: true })
    .fill('Synthetic corrected findings');
  await page
    .getByRole('button', { name: 'Save correction', exact: true })
    .click();
  await expect(entry).toContainText('Synthetic original findings');
  await expect(entry.locator('.corrections')).toContainText(
    'Synthetic corrected findings',
  );
  results.push(
    'Doctor saves and finalizes a consultation with selected shared vitals; original and correction remain visible',
  );
  prescriptionId = await issue(
    'prescription',
    'Synthetic issued medication wording',
  );
  certificateId = await issue(
    'certificate',
    'Synthetic issued certificate wording',
  );
  results.push(
    'Both documents are previewed, reviewed and issued through the real API',
  );
  await logout();
  await login('demo.doctor.head');
  await openPatient();
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await expect(
    page.getByTestId('entry').getByRole('button', { name: 'Add correction' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('entry')).toContainText('Read-only');
  await logout();
  await application?.close();
  application = undefined;
  await start();
  await login('demo.doctor');
  await openPatient();
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await expect(page.getByTestId('entry')).toContainText(
    'Synthetic corrected findings',
  );
  for (const [id, wording] of [
    [prescriptionId, 'Synthetic issued medication wording'],
    [certificateId, 'Synthetic issued certificate wording'],
  ]) {
    await page.getByLabel('Issued document ID').fill(id);
    await page
      .getByRole('button', { name: 'Open document', exact: true })
      .click();
    await expect(page.getByTestId('document-id')).toContainText(id);
    await expect(page.getByTestId('document-paper')).toContainText(wording);
    await expect(
      page.getByRole('button', { name: /Issue (prescription|certificate)/ }),
    ).toHaveCount(0);
    await page
      .getByRole('button', { name: 'Back to chart', exact: true })
      .click();
  }
  results.push(
    'Another author has read-only controls; a fresh Electron client reads the persisted chart and immutable documents by ID',
  );
  assert.deepEqual(errors, []);
  await logout();
  console.log(
    `Live Electron integration passed: ${results.length} flow checks. No print job was sent.`,
  );
  await writeFile(
    resolve(evidence, 'electron-integration.json'),
    JSON.stringify(
      {
        passed: true,
        backend: process.env.HEALTH_IER_SERVER_URL,
        patientId,
        prescriptionId,
        certificateId,
        results,
        rendererErrors: errors,
        physicalPrintTested: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  let message = error instanceof Error ? error.message : 'Integration failed';
  for (const account of credentials)
    message = message.replaceAll(account.password, '[redacted]');
  await writeFile(
    resolve(evidence, 'electron-integration.json'),
    JSON.stringify(
      { passed: false, results, failure: message, patientId },
      null,
      2,
    ),
  );
  console.error(message);
  process.exitCode = 1;
} finally {
  if (application) {
    await application
      .evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      })
      .catch(() => undefined);
    await application.close().catch(() => undefined);
  }
}
