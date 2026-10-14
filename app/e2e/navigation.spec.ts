import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { createDemoClinic } from '../src/renderer/clinic/demo';
import type { ClinicApi } from '../src/renderer/clinic/contract';

declare global {
  interface Window {
    navigationFixture: {
      mutations: string[];
      hold: boolean;
      fail: boolean;
      release: () => void;
      reads: number;
      historyUnavailable: boolean;
      chartUnavailable: boolean;
      historyHold: boolean;
      releaseHistory: () => void;
    };
  }
}

// Synthetic renderer contract only; real IPC/database proof is separate.
function install(fixture: ReturnType<typeof createDemoClinic>): void {
  let release: (() => void) | undefined;
  let releaseHistory: (() => void) | undefined;
  const control = (window.navigationFixture = {
    mutations: [] as string[],
    hold: false,
    fail: false,
    reads: 0,
    historyUnavailable: false,
    chartUnavailable: false,
    historyHold: false,
    releaseHistory: (): void => releaseHistory?.(),
    release: (): void => release?.(),
  });
  const api: ClinicApi = {
    ...fixture.api,
    login: async ({ username }) => ({
      ok: true,
      data: fixture.selectStaff(username),
    }),
    getPatient: async (input) => {
      control.reads++;
      if (control.hold)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (control.fail)
        return {
          ok: false,
          error: {
            code: 'UNAVAILABLE',
            message: 'Synthetic identity read unavailable.',
          },
        };
      return fixture.api.getPatient(input);
    },
    listDocuments: async (input) => {
      if (control.historyHold) {
        await new Promise<void>((resolve) => {
          releaseHistory = resolve;
        });
        return {
          ok: false,
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Synthetic old session expired.',
          },
        };
      }
      return control.historyUnavailable
        ? {
            ok: false,
            error: {
              code: 'UNAVAILABLE',
              message: 'Synthetic history unavailable.',
            },
          }
        : fixture.api.listDocuments(input);
    },
    listEntries: async (input) =>
      control.chartUnavailable
        ? {
            ok: false,
            error: {
              code: 'UNAVAILABLE',
              message: 'Synthetic chart unavailable.',
            },
          }
        : fixture.api.listEntries(input),
    saveEntry: async (input) => {
      control.mutations.push(`entry:${input.patientId}`);
      return fixture.api.saveEntry(input);
    },
    saveVitals: async (input) => {
      control.mutations.push(`vitals:${input.patientId}`);
      return fixture.api.saveVitals(input);
    },
    updatePatient: async (input) => {
      control.mutations.push(`patient:${input.id}`);
      return fixture.api.updatePatient(input);
    },
    issueDocument: async (input) => {
      control.mutations.push(`document:${input.entryId}`);
      return fixture.api.issueDocument(input);
    },
  };
  window.clinicApi = api;
}

async function start(page: Page, staff = 'demo-doctor-1'): Promise<void> {
  await page.route('**/main.tsx*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `import { createDemoClinic as testClinic } from '/clinic/demo.ts';\n(${install.toString()})(testClinic());\n${await response.text()}`,
    });
  });
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill(staff);
  await page.getByLabel('Password', { exact: true }).fill('SYNTHETIC-TEST');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Find a patient').fill('DEMO-0001');
  await page.getByRole('button', { name: 'Find patient', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001' })
    .click();
  await expect(page.locator('.patient-banner')).toContainText('DEMO-0001');
}

async function choose(page: Page, query = 'Mateo'): Promise<void> {
  await page.keyboard.press('Control+k');
  await page
    .getByRole('combobox', { name: 'Search patient name or number' })
    .fill(query);
  await page.getByRole('option', { name: /Mateo Ramos/ }).click();
}

async function medical(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page.getByRole('button', { name: 'New medical entry' }).click();
}

for (const existing of [false, true]) {
  test(`${existing ? 'existing' : 'new'} medical draft decline preserves patient and mutation owner; accept clears once`, async ({
    page,
  }) => {
    await start(page);
    await medical(page);
    if (existing) {
      await page.getByLabel('Reason / symptoms').fill('Saved draft seed');
      await page
        .getByRole('button', { name: 'Save draft', exact: true })
        .click();
      await page
        .getByTestId('entry')
        .filter({ hasText: 'Saved draft seed' })
        .getByRole('button', { name: 'Edit draft' })
        .click();
      await page.evaluate(() => {
        window.navigationFixture.mutations = [];
      });
    }
    await page
      .getByLabel('Reason / symptoms')
      .fill('Synthetic unsaved text for DEMO-0001');
    let prompts = 0;
    page.once('dialog', async (dialog) => {
      prompts++;
      await dialog.dismiss();
    });
    await choose(page);
    await expect(page.locator('.patient-banner')).toContainText('DEMO-0001');
    await expect(page.getByLabel('Reason / symptoms')).toHaveValue(
      'Synthetic unsaved text for DEMO-0001',
    );
    expect(
      await page.evaluate(() => window.navigationFixture.mutations),
    ).toEqual([]);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Saved on this clinic server' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => window.navigationFixture.mutations),
    ).toEqual(['entry:DEMO-0001']);
    await page
      .getByTestId('entry')
      .filter({ hasText: 'Synthetic unsaved text for DEMO-0001' })
      .getByRole('button', { name: 'Edit draft' })
      .click();
    await page.getByLabel('Findings').fill('Discard this edit');
    page.once('dialog', async (dialog) => {
      prompts++;
      await dialog.accept();
    });
    await choose(page);
    await expect(page.locator('.patient-banner')).toContainText('DEMO-0003');
    await medical(page);
    await expect(page.getByLabel('Reason / symptoms')).toHaveValue('');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(prompts).toBe(2);
  });
}

test('vital draft, patient edit and register shortcut retain their owner when declined', async ({
  page,
}) => {
  await start(page, 'demo-attendant');
  await page.getByRole('button', { name: 'Vital signs', exact: true }).click();
  await page.getByRole('button', { name: 'Record vital signs' }).click();
  await page.getByLabel('Systolic pressure (mmHg)').fill('141');
  page.once('dialog', (dialog) => dialog.dismiss());
  await choose(page);
  await expect(page.getByLabel('Systolic pressure (mmHg)')).toHaveValue('141');
  await expect(page.locator('.patient-banner')).toContainText('DEMO-0001');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page
    .getByRole('button', { name: 'Patient details', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit patient details' }).click();
  await page
    .getByLabel('Address', { exact: true })
    .fill('Synthetic retained address');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.keyboard.press('Control+k');
  await page.getByRole('option', { name: /Register patient/ }).click();
  await expect(page.locator('.patient-banner')).toContainText('DEMO-0001');
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue(
    'Synthetic retained address',
  );
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'All patient records' }).click();
  await expect(page.getByLabel('Address', { exact: true })).toHaveValue(
    'Synthetic retained address',
  );
  await page.getByRole('button', { name: 'Save patient' }).click();
  await expect(
    page.getByText('Synthetic retained address', { exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.navigationFixture.mutations)).toEqual(
    ['vitals:DEMO-0001', 'patient:DEMO-0001'],
  );
  await page.getByRole('button', { name: 'Edit patient details' }).click();
  await page.getByLabel('Address', { exact: true }).fill('Discarded address');
  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Control+k');
  await page.getByRole('option', { name: /Register patient/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Register patient' }),
  ).toBeVisible();
  await expect(page.locator('.patient-banner')).toHaveCount(0);
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue('');
});

test('document history retry settles independently of an unavailable chart and recovers', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    window.navigationFixture.historyUnavailable = true;
    window.navigationFixture.chartUnavailable = true;
  });
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  const history = page.getByRole('region', { name: 'Issued documents' });
  await expect(history.getByRole('alert')).toContainText(
    'Synthetic history unavailable',
  );
  await history.getByRole('button', { name: 'Retry document history' }).click();
  await expect(history.getByRole('alert')).toContainText(
    'Synthetic history unavailable',
  );
  await expect(history.getByText('Loading issued documents…')).toHaveCount(0);
  await page.evaluate(() => {
    window.navigationFixture.historyUnavailable = false;
  });
  await history.getByRole('button', { name: 'Retry document history' }).click();
  await expect(history).toContainText('No issued documents for this patient.');
  await expect(history.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText(
    'Synthetic chart unavailable',
  );
});

test('late document history retry cannot expire a replacement staff session', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    window.navigationFixture.historyUnavailable = true;
  });
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Retry document history' }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.navigationFixture.historyHold = true;
  });
  await page.getByRole('button', { name: 'Retry document history' }).click();
  await page
    .getByRole('button', { name: 'Patient records', exact: true })
    .click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByLabel('Username', { exact: true }).fill('demo-clerk');
  await page.getByLabel('Password', { exact: true }).fill('SYNTHETIC-TEST');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Alina Mercado', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    window.navigationFixture.releaseHistory();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect(page.getByText('Alina Mercado', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Staff sign-in' }),
  ).toHaveCount(0);
});

test('failed and superseded patient selections cannot replace an editor or newer navigation', async ({
  page,
}) => {
  await start(page);
  await medical(page);
  await page.getByLabel('Reason / symptoms').fill('Retained draft');
  await page.evaluate(() => {
    window.navigationFixture.fail = true;
  });
  await choose(page);
  await expect(page.getByRole('alert')).toContainText(
    'Synthetic identity read unavailable',
  );
  await expect(page.locator('.patient-banner')).toContainText('DEMO-0001');
  await expect(page.getByLabel('Reason / symptoms')).toHaveValue(
    'Retained draft',
  );
  await page.evaluate(() => {
    window.navigationFixture.fail = false;
    window.navigationFixture.hold = true;
  });
  await choose(page);
  await expect(page.getByText('Opening patient record…')).toBeVisible();
  await page.getByLabel('Reason / symptoms').fill('Newer edit wins');
  await page.evaluate(() => window.navigationFixture.release());
  await expect(page.getByText('Opening patient record…')).toHaveCount(0);
  await expect(page.getByLabel('Reason / symptoms')).toHaveValue(
    'Newer edit wins',
  );
  await choose(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'All patient records' }).click();
  await page.evaluate(() => window.navigationFixture.release());
  await expect(
    page.getByRole('heading', { name: 'Patient records', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.patient-banner')).toHaveCount(0);
  expect(await page.evaluate(() => window.navigationFixture.mutations)).toEqual(
    [],
  );
});

test('document preparation preserves reviewed draft on decline and invalidates review after edits', async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page
    .getByTestId('entry')
    .filter({ hasText: 'Synthetic follow-up consultation' })
    .getByRole('button', { name: 'Prepare prescription' })
    .click();
  await page
    .getByLabel('Medication instructions')
    .fill('Synthetic retained document');
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  await page.getByLabel('I have reviewed this document').check();
  page.once('dialog', (dialog) => dialog.dismiss());
  await choose(page);
  await expect(page.locator('.patient-banner')).toContainText('DEMO-0001');
  await expect(page.getByLabel('I have reviewed this document')).toBeChecked();
  await expect(page.getByTestId('document-paper')).toContainText(
    'Synthetic retained document',
  );
  expect(await page.evaluate(() => window.navigationFixture.mutations)).toEqual(
    [],
  );
  await page
    .getByLabel('Medication instructions')
    .fill('Changed text requires review');
  await expect(
    page.getByRole('button', { name: 'Issue prescription' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  await expect(
    page.getByLabel('I have reviewed this document'),
  ).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Issue prescription' }),
  ).toBeDisabled();
  page.once('dialog', (dialog) => dialog.accept());
  await choose(page);
  await expect(page.locator('.patient-banner')).toContainText('DEMO-0003');
  await expect(page.getByTestId('document-paper')).toHaveCount(0);
});

test('quick search identifies duplicates, supports keyboard selection and restores focus', async ({
  page,
}) => {
  await start(page);
  await medical(page);
  const reason = page.getByLabel('Reason / symptoms');
  await reason.focus();
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', {
    name: 'Search patient name or number',
  });
  await expect(page.getByRole('dialog')).not.toContainText(
    'choose Register patient',
  );
  await search.fill('Lina');
  const options = page
    .getByRole('listbox', { name: 'Patient results and actions' })
    .getByRole('option');
  await expect(options).toHaveCount(2);
  await expect(options.nth(0)).toContainText('Apr 12, 1989');
  await expect(options.nth(1)).toContainText('Sep 8, 1971');
  await search.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(search).toHaveAttribute(
    'aria-activedescendant',
    'command-option-1',
  );
  await search.press('Escape');
  await expect(reason).toBeFocused();
  await page.keyboard.press('Control+k');
  await search.fill('Mateo');
  await expect(page.getByRole('option', { name: /Mateo/ })).toContainText(
    'Birth date: Not recorded',
  );
  await search.press('Enter');
  await expect(page.locator('.patient-banner')).toContainText('DEMO-0003');
});
