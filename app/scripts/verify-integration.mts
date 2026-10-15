import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { _electron, expect } from '@playwright/test';
import type { ElectronApplication, Page, Locator } from '@playwright/test';
import type { Requests, Responses, Result } from '../src/shared/clinic-api.ts';

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
const evidence = resolve(
  appDirectory,
  '../../verification',
  databaseUrl.pathname.slice(1),
  randomUUID(),
);
await mkdir(evidence, { recursive: true });
const bootstrap = resolve(evidence, 'electron-integration-bootstrap.cjs');
await writeFile(
  bootstrap,
  `const { BrowserWindow } = require('electron');\nBrowserWindow.prototype.show = function () {};\nrequire(${JSON.stringify(resolve(appDirectory, 'out/main/index.cjs'))});\n`,
);
const require = createRequire(import.meta.url);
// This private DB client is test-only and never enters the renderer or preload.
const pg = createRequire(requireServer.resolve('@prisma/adapter-pg'))('pg') as {
  Client: new (options: { connectionString: string }) => {
    connect(): Promise<void>;
    query(sql: string, parameters: readonly unknown[]): Promise<unknown>;
    end(): Promise<void>;
  };
};
const database = new pg.Client({
  connectionString: serverEnvironment.DATABASE_URL,
});
const environment: Record<string, string> = {};
for (const [key, value] of Object.entries(process.env)) {
  if (value !== undefined) environment[key] = value;
}
delete environment.ELECTRON_RUN_AS_NODE;
delete environment.ELECTRON_RENDERER_URL;
let application: ElectronApplication | undefined;
let page!: Page;
let name = `Synthetic AMLIG Integration ${randomUUID().slice(0, 8)}`;
const results: string[] = [];
const roleChecks: string[] = [];
let issuedSnapshots: Responses['readDocuments'] = [];
const runIdentity = {
  database: databaseUrl.pathname.slice(1),
  databasePort: databaseUrl.port,
  api: serverUrl.origin,
  evidence,
};
console.log('Owned integration evidence: ' + evidence);
let patientId: string | undefined;
let prescriptionId: string | undefined;
let certificateId: string | undefined;
let otherPatientId: string | undefined;
let printerCount = 0;
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
async function bridgeResult<K extends keyof Requests>(
  name: K,
  input: Requests[K],
): Promise<Result<Responses[K]>> {
  return page.evaluate(
    ({ name, input }) => {
      const operation = window.desktop.clinic[name] as (
        input: Requests[K],
      ) => Promise<Result<Responses[K]>>;
      return operation(input as Requests[K]);
    },
    { name, input },
  );
}
async function bridge<K extends keyof Requests>(
  name: K,
  input: Requests[K],
): Promise<Responses[K]> {
  const response = await bridgeResult(name, input);
  assert.ok(response.ok, `${name}: ${response.ok ? '' : response.error.code}`);
  return response.data;
}
function denied(response: Result<unknown>, code = 'FORBIDDEN'): void {
  assert.ok(!response.ok && response.error.code === code, `Expected ${code}`);
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
  const current = await bridge('currentStaff', undefined);
  assert.ok(current.id && current.displayName);
  assert.ok(!('token' in current) && !('passwordHash' in current));
}
async function logout(): Promise<void> {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Staff sign-in' }),
  ).toBeVisible();
  await expect(page.locator('.patient-banner')).toHaveCount(0);
  denied(
    await bridgeResult('readPatient', {
      id: '20000000-0000-4000-8000-000000000001',
    }),
    'UNAUTHENTICATED',
  );
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
  await database.connect();
  await start();
  // Every named account is exercised through the real renderer/preload/main/API path.
  const seedPatient = '20000000-0000-4000-8000-000000000001';
  for (const account of credentials) {
    await login(account.username);
    const staff = await bridge('currentStaff', undefined);
    const identity = await bridge('readPatient', { id: seedPatient });
    assert.equal(identity.id, seedPatient);
    assert.ok(!('entries' in identity) && !('vitals' in identity));
    if (staff.role === 'medtech')
      assert.deepEqual(Object.keys(identity).sort(), [
        'dateOfBirth',
        'fullName',
        'id',
        'revision',
        'sex',
      ]);
    for (const discipline of ['medical', 'dental', 'laboratory'] as const) {
      const response = await bridgeResult('readEntries', {
        patientId: seedPatient,
        discipline,
      });
      const allowed =
        staff.isHead ||
        (discipline === 'medical' && staff.role === 'doctor') ||
        (discipline === 'dental' && staff.role === 'dentist') ||
        (discipline === 'laboratory' && staff.role === 'medtech');
      if (allowed) {
        assert.ok(response.ok);
        assert.ok(
          response.data.every(
            (entry) => entry.discipline === discipline && entry.authorName,
          ),
        );
      } else denied(response);
    }
    const history = await bridgeResult('readDocuments', {
      patientId: seedPatient,
    });
    if (staff.role === 'doctor') assert.ok(history.ok);
    else denied(history);
    const vitals = await bridgeResult('readVitals', { patientId: seedPatient });
    if (['doctor', 'dentist', 'attendant'].includes(staff.role))
      assert.ok(
        vitals.ok,
        vitals.ok ? undefined : `readVitals: ${vitals.error.code}`,
      );
    else denied(vitals);
    await page.getByLabel('Find a patient').fill(seedPatient);
    await page
      .getByRole('button', { name: 'Find patient', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: `Open ${identity.fullName} ${identity.id}`,
        exact: true,
      })
      .click();
    for (const [discipline, title] of [
      ['medical', 'Medical chart'],
      ['dental', 'Dental chart'],
      ['laboratory', 'Laboratory chart'],
    ] as const) {
      const allowed =
        staff.isHead ||
        (discipline === 'medical' && staff.role === 'doctor') ||
        (discipline === 'dental' && staff.role === 'dentist') ||
        (discipline === 'laboratory' && staff.role === 'medtech');
      const tab = page.getByRole('button', { name: title, exact: true });
      if (allowed) {
        await tab.click();
        await expect(
          page.getByRole('heading', { name: title, exact: true }),
        ).toBeVisible();
      } else await expect(tab).toHaveCount(0);
    }
    roleChecks.push(account.username);
    await logout();
  }
  assert.equal(roleChecks.length, 8);
  results.push(
    'All eight named roles login/current-user/logout, filtered identity, allowed discipline/vitals reads and denied cross-role reads/history',
  );
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
  const beforeUpdate = await bridge('readPatient', { id: patientId });
  name += ' Renamed';
  const updated = await bridge('updatePatient', {
    id: patientId,
    expectedRevision: beforeUpdate.revision,
    fullName: name,
  });
  assert.equal(updated.fullName, name);
  denied(
    await bridgeResult('updatePatient', {
      id: patientId,
      expectedRevision: beforeUpdate.revision,
      fullName: 'Stale name',
    }),
    'CONFLICT',
  );
  assert.equal((await bridge('readPatient', { id: patientId })).fullName, name);
  assert.deepEqual(
    (await bridge('searchPatients', { search: patientId })).map(
      (row) => row.id,
    ),
    [patientId],
  );
  results.push(
    'Registry update/rename, direct current identity, exact patient number lookup and stale revision rejection',
  );
  otherPatientId = (
    await bridge('createPatient', {
      fullName: 'Synthetic Switch Target ' + randomUUID().slice(0, 8),
      sex: null,
      address: null,
      patientCategory: null,
      employeeIdentifier: null,
      dateOfBirth: null,
    })
  ).id;
  await logout();
  await login('demo.attendant');
  await openPatient();
  await page.getByRole('button', { name: 'Vital signs', exact: true }).click();
  await page
    .locator('.page-heading')
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
  const linkedVitals = (await bridge('readVitals', { patientId }))[0];
  assert.ok(
    linkedVitals && linkedVitals.status === 'finalized' && otherPatientId,
  );
  denied(
    await bridgeResult('createMedicalEntry', {
      patientId: otherPatientId,
      consultationDate: '2026-10-15',
      ageAtConsultation: null,
      cs: null,
      vitalsId: linkedVitals.id,
      reason: null,
      findings: null,
      clinicalImpression: null,
      plan: null,
    }),
    'VALIDATION',
  );
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
  const savedEntry = (
    await bridge('readEntries', { patientId, discipline: 'medical' })
  )[0];
  assert.ok(savedEntry);
  await entry.getByRole('button', { name: 'Edit draft', exact: true }).click();
  const reviewedFindings = 'Synthetic original findings after conflict review';
  await page.getByLabel('Findings', { exact: true }).fill(reviewedFindings);
  const advanced = await bridge('updateMedicalEntry', {
    id: savedEntry.id,
    expectedRevision: savedEntry.revision,
    findings: 'Synthetic concurrent draft version',
  });
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The record changed');
  await expect(page.getByLabel('Findings', { exact: true })).toHaveValue(
    reviewedFindings,
  );
  await page
    .getByRole('button', { name: 'Review latest version', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: `Latest version \u00b7 Revision ${advanced.revision} \u00b7 draft`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('.notice')).toContainText(
    'Synthetic concurrent draft version',
  );
  await page
    .getByRole('button', {
      name: 'Use latest revision and keep my input',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Findings', { exact: true })).toHaveValue(
    reviewedFindings,
  );
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(entry).toContainText(reviewedFindings);
  const afterReview = (
    await bridge('readEntries', { patientId, discipline: 'medical' })
  )[0];
  assert.equal(afterReview?.revision, advanced.revision + 1);
  assert.equal(afterReview?.findings, reviewedFindings);
  assert.equal(
    afterReview?.authorName,
    (await bridge('currentStaff', undefined)).displayName,
  );
  results.push(
    'Real stale draft save retains input, reads latest version, explicitly rebases and persists the intended retry',
  );
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
  issuedSnapshots = await bridge('readDocuments', { patientId });
  results.push(
    'Both documents are previewed, reviewed and issued through the real API',
  );
  await logout();
  await login('demo.doctor.head');
  await bridge('readClinicalSummary', { patientId });
  await bridge('listHistoricalDocuments', { patientId });
  const report = await bridge('readReport', {
    from: '2026-10-15',
    to: '2026-10-15',
  });
  assert.ok(Array.isArray(report.sexBreakdown));
  results.push(
    'Clinic head reads clinical summary, historical documents and patient report',
  );
  await openPatient();
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await expect(
    page.getByTestId('entry').getByRole('button', { name: 'Add correction' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('entry')).toContainText('Read-only');
  const readOnlyEntry = (
    await bridge('readEntries', { patientId, discipline: 'medical' })
  )[0];
  assert.ok(readOnlyEntry);
  denied(
    await bridgeResult('correctEntry', {
      id: readOnlyEntry.id,
      expectedRevision: readOnlyEntry.revision,
      reason: 'Denied colleague correction',
      correctedContent: { findings: 'Must not replace another author' },
    }),
  );
  denied(
    await bridgeResult('issueDocument', {
      consultationId: readOnlyEntry.id,
      expectedRevision: readOnlyEntry.revision,
      kind: 'prescription',
      body: 'Denied colleague issuance',
    }),
  );
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
  printerCount = (await bridge('listPrinters', undefined)).length;
  const persistedHistory = await bridge('readDocuments', { patientId });
  assert.deepEqual(persistedHistory, issuedSnapshots);
  assert.deepEqual(
    new Set(persistedHistory.map((document) => document.id)),
    new Set([prescriptionId, certificateId]),
  );
  assert.equal((await bridge('readPatient', { id: patientId })).fullName, name);
  for (const [id, wording] of [
    [prescriptionId, 'Synthetic issued medication wording'],
    [certificateId, 'Synthetic issued certificate wording'],
  ]) {
    assert.deepEqual(
      await bridge('readDocument', { id }),
      issuedSnapshots.find((document) => document.id === id),
    );
    const kind = id === prescriptionId ? 'Prescription' : 'Medical certificate';
    await page
      .getByRole('region', { name: 'Issued documents' })
      .getByRole('listitem')
      .filter({ hasText: kind })
      .getByRole('button', { name: 'View / reprint', exact: true })
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
  results.push(
    'Fresh client discovers both issued documents in persisted patient history and opens immutable same-ID snapshots',
  );
  // A real network cancellation exercises unsaved UI recovery; no response/mock bridge is injected.
  await page
    .getByRole('button', { name: 'New medical entry', exact: true })
    .click();
  const unsaved = 'Synthetic unsaved real bridge safety';
  await page.getByLabel('Reason / symptoms', { exact: true }).fill(unsaved);
  const beforeDrafts = await bridge('readEntries', {
    patientId,
    discipline: 'medical',
  });
  await application!.evaluate(({ session }, origin) => {
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: [origin + '/*'] },
      (_details, callback) => callback({ cancel: true }),
    );
  }, serverUrl.origin);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'If you were saving, check the record before you try again',
  );
  await expect(
    page.getByLabel('Reason / symptoms', { exact: true }),
  ).toHaveValue(unsaved);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await application!.evaluate(({ session }) =>
    session.defaultSession.webRequest.onBeforeRequest(null),
  );
  assert.equal(
    (await bridge('readEntries', { patientId, discipline: 'medical' })).length,
    beforeDrafts.length,
  );
  results.push(
    'Real transport failure retains unsaved clinical text/patient and makes no false durable-save claim',
  );
  // Decline a real quick-search switch; context and server data must remain with the original patient.
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page.keyboard.press('Control+k');
  assert.ok(otherPatientId);
  const otherDrafts = await bridge('readEntries', {
    patientId: otherPatientId,
    discipline: 'medical',
  });
  await page
    .getByRole('combobox', { name: 'Search patient name or number' })
    .fill(otherPatientId);
  await page
    .getByRole('listbox', { name: 'Patient results and actions' })
    .getByRole('option')
    .filter({ hasText: otherPatientId })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(
    page.getByLabel('Reason / symptoms', { exact: true }),
  ).toHaveValue(unsaved);
  assert.equal(
    (await bridge('readEntries', { patientId, discipline: 'medical' })).length,
    beforeDrafts.length,
  );
  assert.deepEqual(
    await bridge('readEntries', {
      patientId: otherPatientId,
      discipline: 'medical',
    }),
    otherDrafts,
  );
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  results.push(
    'Declined live patient switch retains patient/screen/unsaved text and causes no mutation; accepted cancel clears draft',
  );
  const sessionStaff = await bridge('currentStaff', undefined);
  await database.query(
    'UPDATE "Session" SET "expiresAt"=$1 WHERE "staffId"=$2::uuid',
    [new Date(0), sessionStaff.id],
  );
  denied(await bridgeResult('currentStaff', undefined), 'UNAUTHENTICATED');
  await expect(
    page.getByRole('heading', { name: 'Staff sign-in' }),
  ).toBeVisible();
  await expect(page.locator('.patient-banner')).toHaveCount(0);
  denied(await bridgeResult('readDocuments', { patientId }), 'UNAUTHENTICATED');
  results.push(
    'Real database session expiry invalidates broker generation and clears renderer patient/chart/document access',
  );
  assert.deepEqual(errors, []);
  console.log(
    `Live Electron integration passed: ${results.length} flow checks. No print job was sent.`,
  );
  await writeFile(
    resolve(evidence, 'electron-integration.json'),
    JSON.stringify(
      {
        passed: true,
        runIdentity,
        roles: roleChecks,
        backend: process.env.HEALTH_IER_SERVER_URL,
        patientId,
        prescriptionId,
        certificateId,
        results,
        rendererErrors: errors,
        printerCount,
        printerSubmissionTested: false,
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
      {
        passed: false,
        runIdentity,
        roles: roleChecks,
        results,
        failure: message,
        patientId,
      },
      null,
      2,
    ),
  );
  console.error(message);
  process.exitCode = 1;
} finally {
  await database.end().catch(() => undefined);
  if (application) {
    await application
      .evaluate(({ BrowserWindow }) => {
        for (const window of BrowserWindow.getAllWindows()) window.destroy();
      })
      .catch(() => undefined);
    await application.close().catch(() => undefined);
  }
}
