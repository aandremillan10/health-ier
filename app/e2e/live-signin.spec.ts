import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function noDemo(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: 'Frontend demo' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Demo staff')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Open frontend demo' }),
  ).toHaveCount(0);
  await expect(page.getByText('Demo controls', { exact: true })).toHaveCount(0);
  await expect(
    page.getByText('Frontend demo · Memory only', { exact: true }),
  ).toHaveCount(0);
}

test('Electron renderer has no demo fallback, including injected browser QA bridge', async ({
  page,
}): Promise<void> => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'clinicApi', {
      value: {
        login: () => {
          throw new Error('Browser QA bridge must not be used');
        },
      },
    });
  });
  await page.goto('/?demo=true');
  await noDemo(page);
  await expect(
    page.getByRole('heading', { name: 'Staff sign-in' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'The desktop connection is unavailable. Restart the clinic app and try again.',
    ),
  ).toBeVisible();
  await page.getByLabel('Username', { exact: true }).fill('synthetic');
  await page
    .getByLabel('Password', { exact: true })
    .fill('SYNTHETIC-TEST-VALUE');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    'desktop connection is unavailable',
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await noDemo(page);
});

test('Electron renderer reports failed live bridge without offering memory mode', async ({
  page,
}): Promise<void> => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'desktop', {
      value: {
        platform: 'win32',
        clinic: {
          onSessionReset: () => (): void => undefined,
          login: async () => ({
            ok: false,
            error: {
              code: 'UNAVAILABLE',
              message: 'Clinic server is unavailable.',
            },
          }),
        },
      },
    });
  });
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('synthetic');
  await page
    .getByLabel('Password', { exact: true })
    .fill('SYNTHETIC-TEST-VALUE');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Clinic server is unavailable.',
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await noDemo(page);
});
