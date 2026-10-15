import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve(__dirname, '../../../verification/workflow-ux');

// Failure modes: patient selection leaves the current task, clearing queue scope
// loses access, a blocked registration gives no next step, and nested surfaces return.
test('schedule a patient without leaving daily clinic flow', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Demo staff').selectOption('demo-clerk');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await page.getByRole('button', { name: 'Clinic flow', exact: true }).click();
  await page.getByLabel('Clinic date', { exact: true }).fill('2026-10-20');
  await page
    .getByRole('button', { name: 'Choose patient', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Search patient name or number' })
    .fill('DEMO-0001');
  await page.getByRole('option', { name: /Lina Marquez.*DEMO-0001/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Daily clinic flow' }),
  ).toBeVisible();
  await expect(page.getByLabel('Clinic date', { exact: true })).toHaveValue(
    '2026-10-20',
  );
  await expect(
    page.getByRole('button', { name: 'Save appointment', exact: true }),
  ).toBeVisible();
  const timeTop = await page
    .locator('#appointment-time')
    .evaluate((element) => element.getBoundingClientRect().top);
  const disciplineTop = await page
    .locator('#appointment-new-discipline')
    .evaluate((element) => element.getBoundingClientRect().top);
  const saveTop = await page
    .getByRole('button', { name: 'Save appointment', exact: true })
    .evaluate((element) => element.getBoundingClientRect().top);
  expect(disciplineTop).toBe(timeTop);
  expect(saveTop).toBe(timeTop);
  await page
    .getByRole('button', { name: 'Save appointment', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Appointment saved for Lina Marquez' }),
  ).toBeVisible();
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${evidence}/clinic-flow.png`,
    fullPage: true,
  });
});

test('laboratory empty state selects a patient in place and keeps draft guards', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await page
    .getByRole('button', { name: 'Laboratory orders', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Choose patient', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Search patient name or number' })
    .fill('DEMO-0001');
  await page.getByRole('option', { name: /Lina Marquez.*DEMO-0001/ }).click();
  await expect(
    page.getByRole('button', { name: 'New laboratory order', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'New laboratory order', exact: true })
    .click();
  await page
    .getByLabel('Requested tests', { exact: true })
    .fill('Synthetic test');
  page.once('dialog', (dialog) => dialog.dismiss());
  await expect(
    page.getByRole('button', { name: 'Change patient', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Search patients', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Search patient name or number' })
    .fill('DEMO-0003');
  await page.getByRole('option', { name: /Mateo Ramos/ }).click();
  await expect(page.getByLabel('Requested tests', { exact: true })).toHaveValue(
    'Synthetic test',
  );
  await expect(page.locator('.patient-banner')).toContainText('DEMO-0001');
  await page
    .getByRole('button', { name: 'Create laboratory order', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: /Synthetic test.*Ordered/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Synthetic test.*Ordered/ }).click();
  await expect(page.locator('.lab-order-detail')).toContainText(
    'Synthetic test',
  );
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${evidence}/laboratory.png`, fullPage: true });
});

test('referral patient picker stays in the task and can return to the inbox', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await page.getByRole('button', { name: 'Referrals', exact: true }).click();
  await page
    .getByRole('button', { name: 'Choose patient for referral', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Search patient name or number' })
    .fill('DEMO-0001');
  await page.getByRole('option', { name: /Lina Marquez.*DEMO-0001/ }).click();
  await page.getByRole('button', { name: 'New referral', exact: true }).click();
  await page
    .getByLabel('Reason / requested task', { exact: true })
    .fill('Synthetic dental review');
  await page
    .getByRole('button', { name: 'Send referral', exact: true })
    .click();
  await expect(
    page.getByRole('button', {
      name: /Lina Marquez.*Dental.*Pending acceptance/,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'View work queue', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'My unit inbox', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.patient-banner')).toHaveCount(0);
});

test('patient scope can return to the laboratory queue', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Demo staff').selectOption('demo-medtech-1');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Laboratory orders', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'View work queue', exact: true })
    .click();
  await expect(page.getByLabel('Queue view', { exact: true })).toBeVisible();
  await expect(page.locator('.patient-banner')).toHaveCount(0);
});

test('registration explains duplicate check and resets it after an identity change', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Demo staff').selectOption('demo-clerk');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await page
    .getByRole('button', { name: 'Register patient', exact: true })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Check existing records before you save.' }),
  ).toBeVisible();
  await page
    .getByLabel('Full name', { exact: true })
    .fill('Synthetic UX patient');
  await page
    .getByRole('button', { name: 'Check existing records', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Save patient', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Full name', { exact: true }).fill('Lina Marquez');
  await expect(
    page.getByRole('button', { name: 'Save patient', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Check existing records', exact: true })
    .click();
  await expect(
    page.getByText('Possible existing records', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Save patient', exact: true }),
  ).toBeDisabled();
});

test('clinical sections use flat surfaces at desktop and narrow widths', async ({
  page,
}) => {
  await mkdir(evidence, { recursive: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Clinical summary', exact: true }),
  ).toBeVisible();
  expect(
    await page.locator('.panel').evaluateAll((panels) =>
      panels.every((panel) => {
        const style = getComputedStyle(panel);
        return (
          style.borderRadius === '0px' &&
          style.backgroundColor === 'rgba(0, 0, 0, 0)'
        );
      }),
    ),
  ).toBe(true);
  for (const width of [1280, 1024, 390]) {
    await page.setViewportSize({ width, height: 800 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${evidence}/patient-${width}.png`,
      fullPage: true,
    });
  }
});
