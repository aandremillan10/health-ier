import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type * as Wire from '../src/shared/clinic-api';
import {
  document,
  ids,
  instant,
  patient,
  principal,
} from '../src/privileged/test-fixtures';

declare global {
  interface Window {
    desktopFixture: {
      denied: boolean;
      wrongPatient: boolean;
      printed: Wire.PrintInput | null;
      reset: () => void;
    };
  }
}

// Failure modes: reset during login, nullable fields, lost correction history,
// wrong-patient documents, stale print identities and expiry retaining private views.
function installDesktop(data: {
  patient: Wire.Patient;
  staff: Wire.Staff;
  document: Wire.IssuedDocument;
  instant: string;
}): void {
  let listener: ((event: Wire.SessionReset) => void) | undefined;
  const control = (window.desktopFixture = {
    denied: false,
    wrongPatient: false,
    printed: null as Wire.PrintInput | null,
    reset: (): void => listener?.({ generation: 2, reason: 'expired' }),
  });
  const entry: Wire.Entry = {
    id: data.document.consultationId,
    patientId: data.patient.id,
    authorId: data.staff.id,
    authorName: data.staff.displayName,
    status: 'finalized',
    revision: 2,
    createdAt: data.instant,
    updatedAt: data.instant,
    discipline: 'medical',
    consultationDate: '2026-10-14',
    ageAtConsultation: null,
    cs: null,
    vitalsId: null,
    reason: 'Synthetic consultation',
    findings: null,
    clinicalImpression: null,
    plan: null,
    text: null,
  };
  function ok<T>(value: T): Promise<Wire.Result<T>> {
    return Promise.resolve({ ok: true, data: value });
  }
  function unavailable<T>(): Promise<Wire.Result<T>> {
    return Promise.resolve({
      ok: false,
      error: { code: 'UNAVAILABLE', message: 'Unused fixture operation' },
    });
  }
  const clinic: Wire.ClinicApi = {
    login: async () => {
      listener?.({ generation: 1, reason: 'account-switch' });
      return ok({ staff: data.staff, generation: 1 });
    },
    currentStaff: () => ok(data.staff),
    logout: () => ok({ loggedOut: true, serverRevoked: true }),
    health: () => ok({ status: 'ok', mode: 'EDGE' }),
    searchPatients: ({ search }) =>
      ok(
        data.patient.fullName.toLowerCase().includes(search.toLowerCase())
          ? [data.patient]
          : [],
      ),
    readPatient: () => ok(data.patient),
    readDocuments: () => ok([data.document]),
    createPatient: unavailable,
    updatePatient: unavailable,
    readVitals: () => ok([]),
    createVitals: unavailable,
    updateVitals: unavailable,
    finalizeVitals: unavailable,
    correctVitals: unavailable,
    readEntries: () =>
      control.denied
        ? Promise.resolve({
            ok: false,
            error: {
              code: 'FORBIDDEN',
              message: 'Synthetic chart access denied',
            },
          })
        : ok([entry]),
    readCorrections: () =>
      ok([
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          originalEntryId: entry.id,
          originalType: 'entry',
          sourceRevision: 1,
          revision: 2,
          authorId: data.staff.id,
          authorName: data.staff.displayName,
          reason: 'Synthetic correction',
          correctedContent: { findings: 'Corrected synthetic findings' },
          createdAt: data.instant,
        },
      ]),
    createMedicalEntry: unavailable,
    updateMedicalEntry: unavailable,
    finalizeEntry: unavailable,
    correctEntry: unavailable,
    previewDocument: (input) =>
      ok({
        ...data.document,
        kind: input.kind,
        snapshot: {
          ...data.document.snapshot,
          body: input.body,
          purpose: input.purpose ?? null,
          remarks: input.remarks ?? null,
        },
      }),
    issueDocument: unavailable,
    readDocument: () =>
      ok({
        ...data.document,
        patientId: control.wrongPatient
          ? 'ffffffff-ffff-4fff-8fff-ffffffffffff'
          : data.patient.id,
        snapshot: {
          ...data.document.snapshot,
          followUp: 'Synthetic additional follow-up',
        },
      }),
    listPrinters: () =>
      ok([{ name: 'TEST-PRINTER', displayName: 'Synthetic clinic printer' }]),
    printDocument: (input) => {
      control.printed = input;
      return ok({ documentId: input.documentId, submitted: true });
    },
    onSessionReset: (callback) => {
      listener = callback;
      return () => {
        listener = undefined;
      };
    },
  };
  Object.defineProperty(window, 'desktop', {
    value: { platform: 'win32', clinic },
  });
}

async function open(page: Page): Promise<void> {
  await page.route('**/main.tsx*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `(${installDesktop.toString()})(${JSON.stringify({ patient, staff: principal, document, instant })});\n${await response.text()}`,
    });
  });
  await page.goto('/');
  await expect(page).toHaveTitle('AMLIG');
  await page.getByLabel('Username', { exact: true }).fill('synthetic');
  await page.getByLabel('Password', { exact: true }).fill('SYNTHETIC-TEST');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Find a patient').fill('Synthetic');
  await page.getByRole('button', { name: 'Find patient', exact: true }).click();
  await page
    .getByRole('button', { name: `Open Synthetic Patient ${ids.patient}` })
    .click();
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
}

test('desktop bridge maps chart history and issued documents, prints the same ID and clears on reset', async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByText('Corrected synthetic findings', { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('entry')).toContainText('Synthetic Doctor');
  await page.getByLabel('Issued document ID').fill(ids.document);
  await page
    .getByRole('button', { name: 'Open document', exact: true })
    .click();
  await expect(page.getByTestId('document-paper')).toContainText(
    'Synthetic additional follow-up',
  );
  await page
    .getByLabel('Printer', { exact: true })
    .selectOption('TEST-PRINTER');
  await page
    .getByRole('button', { name: 'Print prescription', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm print', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.desktopFixture.printed))
    .toEqual({
      documentId: ids.document,
      printerName: 'TEST-PRINTER',
      copies: 1,
      duplexMode: 'simplex',
    });
  await page.evaluate(() => window.desktopFixture.reset());
  await expect(
    page.getByRole('heading', { name: 'Staff sign-in' }),
  ).toBeVisible();
  await expect(page.getByTestId('document-paper')).toHaveCount(0);
  await expect(
    page.getByText('Synthetic Patient', { exact: true }),
  ).toHaveCount(0);
});

test('desktop errors and documents for another patient do not expose their content', async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    window.desktopFixture.wrongPatient = true;
  });
  await page.getByLabel('Issued document ID').fill(ids.document);
  await page
    .getByRole('button', { name: 'Open document', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'belongs to another patient',
  );
  await expect(page.getByTestId('document-paper')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Patient details', exact: true })
    .click();
  await page.evaluate(() => {
    window.desktopFixture.denied = true;
  });
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Synthetic chart access denied',
  );
  await expect(
    page.getByText('Corrected synthetic findings', { exact: true }),
  ).toHaveCount(0);
});

test('clearable search restores focus and breadcrumbs keep navigation predictable', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  const input = page.getByLabel('Find a patient');
  await input.fill('Lina');
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('');
  await input.fill('Lina');
  await input.press('Escape');
  await expect(input).toHaveValue('');
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001' })
    .click();
  await page
    .getByRole('button', { name: 'All patient records', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Patient records', exact: true }),
  ).toBeVisible();
  const logo = page.locator('.brand img');
  await expect(logo).toBeVisible();
  expect(
    await logo.evaluate((element: HTMLImageElement) => element.naturalWidth),
  ).toBeGreaterThan(0);
});
