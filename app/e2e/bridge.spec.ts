import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { createDemoClinic } from '../src/renderer/clinic/demo';
import type { ClinicError, Result } from '../src/renderer/clinic/contract';

declare global {
  interface Window {
    frontendTest: {
      delayMs: number;
      loginFails: boolean;
      logoutFails: boolean;
      expired: boolean;
      changedRole: boolean;
      deniedEntries: boolean;
      denyDocument: boolean;
      printersEmpty: boolean;
      rejectPrint: boolean;
      validation: boolean;
      documentReads: number;
      hideEntries: boolean;
      conflictNext: boolean;
      holdLogin: boolean;
      releaseLogin: () => void;
      reset: (reason: string) => void;
    };
  }
}

// Test-only named bridge. It exercises renderer responses, not authentication or IPC.
function installBridge(fixture: ReturnType<typeof createDemoClinic>): void {
  let resetListener: ((reason: string) => void) | undefined;
  const control = (window.frontendTest = {
    delayMs: 0,
    loginFails: false,
    logoutFails: false,
    expired: false,
    changedRole: false,
    deniedEntries: false,
    denyDocument: false,
    printersEmpty: false,
    rejectPrint: false,
    validation: false,
    documentReads: 0,
    hideEntries: false,
    conflictNext: false,
    holdLogin: false,
    releaseLogin: (): void => undefined,
    reset: (reason: string): void => resetListener?.(reason),
  });
  function fail<T>(
    code: ClinicError['code'],
    message: string,
    fieldErrors?: Record<string, string>,
  ): Result<T> {
    return { ok: false, error: { code, message, fieldErrors } };
  }
  async function wait(): Promise<void> {
    await new Promise<void>((resolve) =>
      window.setTimeout(resolve, control.delayMs),
    );
  }
  window.clinicApi = {
    ...fixture.api,
    async login({
      username,
    }): Promise<Awaited<ReturnType<typeof fixture.api.login>>> {
      if (control.holdLogin)
        await new Promise<void>((resolve) => {
          control.releaseLogin = resolve;
        });
      await wait();
      if (control.loginFails)
        return fail(
          'UNAUTHENTICATED',
          'Test fixture: sign-in failed. Check your username and password.',
        );
      control.expired = false;
      return {
        ok: true,
        data: fixture.selectStaff(
          username === 'clerk' ? 'demo-clerk' : 'demo-doctor-1',
        ),
      };
    },
    async logout(): Promise<Result<null>> {
      await wait();
      if (control.logoutFails)
        return fail('UNAVAILABLE', 'Test fixture: logout unavailable.');
      return fixture.api.logout();
    },
    onSessionReset: (listener) => {
      resetListener = listener;
      return (): void => {
        resetListener = undefined;
      };
    },
    async me(): Promise<Awaited<ReturnType<typeof fixture.api.me>>> {
      if (control.expired)
        return fail('UNAUTHENTICATED', 'Test fixture: session expired.');
      if (control.changedRole)
        return { ok: true, data: fixture.selectStaff('demo-clerk') };
      return fixture.api.me();
    },
    async findPatients(
      input,
    ): Promise<Awaited<ReturnType<typeof fixture.api.findPatients>>> {
      await wait();
      if (control.expired)
        return fail('UNAUTHENTICATED', 'Test fixture: session expired.');
      return fixture.api.findPatients(input);
    },
    async updatePatient(
      input,
    ): Promise<Awaited<ReturnType<typeof fixture.api.updatePatient>>> {
      if (control.validation)
        return fail('VALIDATION', 'Check the marked fields.', {
          address: 'Test fixture: address is too long.',
          dateOfBirth: 'Test fixture: check birth date.',
        });
      return fixture.api.updatePatient(input);
    },
    async listEntries(
      input,
    ): Promise<Awaited<ReturnType<typeof fixture.api.listEntries>>> {
      await wait();
      if (control.deniedEntries)
        return fail('DENIED', 'Test fixture: chart access denied.');
      return control.hideEntries
        ? { ok: true, data: [] }
        : fixture.api.listEntries(input);
    },
    async previewDocument(
      input,
    ): Promise<Awaited<ReturnType<typeof fixture.api.previewDocument>>> {
      if (control.conflictNext) {
        control.conflictNext = false;
        fixture.conflictNext();
      }
      return fixture.api.previewDocument(input);
    },
    async getDocument(
      input,
    ): Promise<Awaited<ReturnType<typeof fixture.api.getDocument>>> {
      control.documentReads++;
      await wait();
      if (control.denyDocument)
        return fail('DENIED', 'Test fixture: document access denied.');
      return fixture.api.getDocument(input);
    },
    async listPrinters(): Promise<
      Awaited<ReturnType<typeof fixture.api.listPrinters>>
    > {
      await wait();
      return control.printersEmpty
        ? { ok: true, data: [] }
        : fixture.api.listPrinters();
    },
    async printDocument(
      input,
    ): Promise<Awaited<ReturnType<typeof fixture.api.printDocument>>> {
      return control.rejectPrint
        ? { ok: true, data: { submitted: false } }
        : fixture.api.printDocument(input);
    },
  };
}

async function bridge(page: Page): Promise<void> {
  await page.route('**/main.tsx*', async (route): Promise<void> => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `import { createDemoClinic as testClinic } from '/clinic/demo.ts';\n(${installBridge.toString()})(testClinic());\n${await response.text()}`,
    });
  });
  await page.goto('/');
  expect(await page.evaluate(() => Boolean(window.clinicApi))).toBe(true);
}
async function login(page: Page, username = 'doctor'): Promise<void> {
  await page.getByLabel('Username', { exact: true }).fill(username);
  await page
    .getByLabel('Password', { exact: true })
    .fill('SYNTHETIC-TEST-VALUE');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Patient records', exact: true }),
  ).toBeVisible();
}
async function openPatient(page: Page): Promise<void> {
  await page.getByLabel('Find a patient').fill('DEMO-0001');
  await page.getByRole('button', { name: 'Find patient', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001' })
    .click();
}

for (const resetReason of [
  'expired',
  'logout',
  'window-closed',
  'account-switch',
]) {
  test(`a ${resetReason} reset during pending sign-in rejects its stale response`, async ({
    page,
  }): Promise<void> => {
    await bridge(page);
    await page.evaluate(() => {
      window.frontendTest.holdLogin = true;
    });
    await page.getByLabel('Username', { exact: true }).fill('doctor');
    await page
      .getByLabel('Password', { exact: true })
      .fill('SYNTHETIC-TEST-VALUE');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Signing in…' }),
    ).toBeDisabled();
    await page.evaluate((reason) => {
      window.frontendTest.reset(reason);
      window.frontendTest.releaseLogin();
    }, resetReason);
    await expect(
      page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole('heading', { name: 'Staff sign-in' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Patient records', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  });
}

test('age is calculated from birth date and visit date without manual entry', async ({
  page,
}): Promise<void> => {
  // Failure modes: off-by-one birthdays, negative ages, unknown DOB and drifting issued ages.
  await bridge(page);
  await login(page);
  await openPatient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page.getByRole('button', { name: 'New medical entry' }).click();
  await expect(page.getByLabel('Age at consultation (optional)')).toHaveCount(
    0,
  );
  await page.getByLabel('Reason / symptoms').fill('Automatic age check');
  const cases = [
    ['2026-04-11', 36],
    ['2026-04-12', 37],
    ['2026-04-13', 37],
    ['1989-04-12', 0],
    ['1989-04-11', null],
  ] as const;
  for (const [visitDate, expectedAge] of cases) {
    await page.getByLabel('Consultation date').fill(visitDate);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    const entry = await page.evaluate(async () => {
      const result = await window.clinicApi!.listEntries({
        patientId: 'DEMO-0001',
        discipline: 'medical',
      });
      return result.ok
        ? result.data.find((entry) => entry.reason === 'Automatic age check')
        : null;
    });
    expect(entry?.ageAtConsultation).toBe(expectedAge);
    await page
      .getByTestId('entry')
      .filter({ hasText: 'Automatic age check' })
      .getByRole('button', { name: 'Edit draft' })
      .click();
  }
  await page.getByLabel('Consultation date').fill('2026-04-11');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const own = page
    .getByTestId('entry')
    .filter({ hasText: 'Automatic age check' });
  await own.getByRole('button', { name: 'Finalize entry' }).click();
  await page.getByRole('button', { name: 'Confirm finalization' }).click();
  await own.getByRole('button', { name: 'Prepare prescription' }).click();
  await page
    .getByLabel('Medication instructions')
    .fill('Synthetic age snapshot check');
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  await expect(page.getByTestId('document-paper')).toContainText('Age: 36');
  await page.getByLabel('I have reviewed this document').check();
  await page.getByRole('button', { name: 'Issue prescription' }).click();
  await page.clock.setFixedTime(new Date('2030-10-14T00:00:00Z'));
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await page.getByRole('button', { name: 'View / reprint' }).click();
  await expect(page.getByTestId('document-paper')).toContainText('Age: 36');
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await page
    .getByRole('button', { name: 'Patient records', exact: true })
    .click();
  await page.getByLabel('Find a patient').fill('DEMO-0003');
  await page.getByRole('button', { name: 'Find patient', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open Mateo Ramos DEMO-0003' })
    .click();
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page.getByRole('button', { name: 'New medical entry' }).click();
  await page
    .getByLabel('Reason / symptoms')
    .fill('Unknown birth date age check');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const unknown = await page.evaluate(async () => {
    const result = await window.clinicApi!.listEntries({
      patientId: 'DEMO-0003',
      discipline: 'medical',
    });
    return result.ok
      ? result.data.find(
          (entry) => entry.reason === 'Unknown birth date age check',
        )
      : null;
  });
  expect(unknown?.ageAtConsultation).toBeNull();
});

test('missing latest consultation keeps document conflict blocked and allows review retry', async ({
  page,
}): Promise<void> => {
  await bridge(page);
  await login(page);
  await openPatient(page);
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
    .fill('Retain document text after missing source');
  await page.evaluate(() => {
    window.frontendTest.conflictNext = true;
  });
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  await page.evaluate(() => {
    window.frontendTest.hideEntries = true;
  });
  await page
    .getByRole('button', { name: 'Review latest consultation' })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Latest consultation is unavailable',
  );
  await expect(
    page.getByRole('button', { name: 'Preview prescription' }),
  ).toBeDisabled();
  await expect(page.getByLabel('Medication instructions')).toHaveValue(
    'Retain document text after missing source',
  );
  await page.evaluate(() => {
    window.frontendTest.hideEntries = false;
  });
  await page
    .getByRole('button', { name: 'Review latest consultation' })
    .click();
  await page
    .getByRole('button', {
      name: 'Use latest revision and keep my document text',
    })
    .click();
  await expect(
    page.getByRole('button', { name: 'Preview prescription' }),
  ).toBeEnabled();
});

test('named bridge sign-in errors/loading and logout clear private views', async ({
  page,
}): Promise<void> => {
  await bridge(page);
  await page.evaluate(() => {
    window.frontendTest.loginFails = true;
    window.frontendTest.delayMs = 600;
  });
  await page.getByLabel('Username', { exact: true }).fill('doctor');
  await page
    .getByLabel('Password', { exact: true })
    .fill('SYNTHETIC-TEST-VALUE');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Signing in…' }),
  ).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('sign-in failed');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await page.evaluate(() => {
    window.frontendTest.loginFails = false;
    window.frontendTest.delayMs = 0;
  });
  await login(page);
  await openPatient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await expect(
    page.getByText('Synthetic examination notes for demonstration.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.frontendTest.logoutFails = true;
    window.frontendTest.delayMs = 600;
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText('Synthetic examination notes for demonstration.', {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText(
    'Server sign-out could not be confirmed',
  );
  await login(page, 'clerk');
  await expect(
    page.getByRole('button', { name: 'Medical chart', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Lina Marquez', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test('permission changes and expired session invalidate chart state', async ({
  page,
}): Promise<void> => {
  await bridge(page);
  await login(page);
  await openPatient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page.evaluate(() => {
    window.frontendTest.changedRole = true;
    window.dispatchEvent(new Event('focus'));
  });
  await expect(
    page.getByRole('heading', { name: 'Staff sign-in' }),
  ).toBeVisible();
  await expect(
    page.getByText('Synthetic examination notes for demonstration.', {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    window.frontendTest.changedRole = false;
  });
  await login(page, 'clerk');
  await page.evaluate(() => {
    window.frontendTest.expired = true;
  });
  await page.getByLabel('Find a patient').fill('Lina');
  await page.getByRole('button', { name: 'Find patient', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Staff sign-in' }),
  ).toBeVisible();
});

test('server validation reaches each marked input and retains unsaved text', async ({
  page,
}): Promise<void> => {
  await bridge(page);
  await login(page, 'clerk');
  await openPatient(page);
  await page.getByRole('button', { name: 'Edit patient details' }).click();
  await page.getByLabel('Address').fill('Keep this input');
  await page.evaluate(() => {
    window.frontendTest.validation = true;
  });
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByLabel('Address')).toHaveValue('Keep this input');
  await expect(page.getByLabel('Address')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByLabel('Address')).toHaveAttribute(
    'aria-describedby',
    'address-error',
  );
  await expect(page.getByLabel('Birth date (optional)')).toHaveAttribute(
    'aria-describedby',
    'dateOfBirth-hint dateOfBirth-error',
  );
  page.once('dialog', (dialog) => void dialog.dismiss());
  await page
    .getByRole('button', { name: 'Patient records', exact: true })
    .click();
  await expect(page.getByLabel('Address')).toHaveValue('Keep this input');
});

test('issued snapshot requires fresh authorization; empty and rejected printer states are safe', async ({
  page,
}): Promise<void> => {
  await bridge(page);
  await login(page);
  await openPatient(page);
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
    .fill('Test-only document text');
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  await page.getByLabel('I have reviewed this document').check();
  await page.evaluate(() => {
    window.frontendTest.printersEmpty = true;
  });
  await page.getByRole('button', { name: 'Issue prescription' }).click();
  const id = await page.getByTestId('document-id').textContent();
  await expect(
    page.getByText('No printers found. Connect a printer, then refresh.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Print prescription', exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    window.frontendTest.printersEmpty = false;
    window.frontendTest.rejectPrint = true;
  });
  await page.getByRole('button', { name: 'Refresh printers' }).click();
  await page
    .getByRole('button', { name: 'Print prescription', exact: true })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Confirm print' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'No print job was submitted',
  );
  await expect(page.getByTestId('document-id')).toHaveText(id ?? '');
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await page.evaluate(() => {
    window.frontendTest.denyDocument = true;
  });
  await page.getByRole('button', { name: 'View / reprint' }).click();
  await expect(page.getByRole('alert')).toContainText('document access denied');
  await expect(page.getByTestId('document-paper')).toHaveCount(0);
  expect(await page.evaluate(() => window.frontendTest.documentReads)).toBe(1);
  await page.evaluate(() => {
    window.frontendTest.deniedEntries = true;
  });
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('chart access denied');
  await expect(
    page.getByText('Synthetic examination notes for demonstration.', {
      exact: true,
    }),
  ).toHaveCount(0);
});
