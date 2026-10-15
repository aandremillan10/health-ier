import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve(__dirname, '../../../verification/arc-components');

// Failure modes: progress claims a duplicate check is complete after an identity
// edit, theme CSS hides keyboard focus, and progress overflows narrow windows.
test('Arc registration progress follows the required record check', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByLabel('Demo staff').selectOption('demo-clerk');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await page
    .getByRole('button', { name: 'Register patient', exact: true })
    .click();
  const progress = page.getByRole('group', {
    name: 'Patient registration progress',
  });
  await expect(progress.locator('[aria-current="step"]')).toContainText(
    'Enter details',
  );
  const name = page.getByLabel('Full name', { exact: true });
  await name.fill('Synthetic Arc patient');
  await name.press('Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(name).toBeFocused();
  expect(
    await name.evaluate((node) => getComputedStyle(node).outlineStyle),
  ).toBe('solid');
  await expect(progress.locator('[aria-current="step"]')).toContainText(
    'Check records',
  );
  await page
    .getByRole('button', { name: 'Check existing records', exact: true })
    .click();
  await expect(progress.locator('[aria-current="step"]')).toContainText(
    'Save patient',
  );
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `${evidence}/registration.png`,
    fullPage: true,
  });
  await name.fill('Lina Marquez');
  await expect(progress.locator('[aria-current="step"]')).toContainText(
    'Check records',
  );
  await expect(
    page.getByRole('button', { name: 'Save patient', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Check existing records', exact: true })
    .click();
  await expect(progress.locator('[aria-current="step"]')).toContainText(
    'Check records',
  );
  await page
    .getByLabel('I checked these records. This is a different patient.')
    .check();
  await expect(progress.locator('[aria-current="step"]')).toContainText(
    'Save patient',
  );
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});

test('Arc record badges keep clinical state readable with reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await expect(
    page
      .getByTestId('entry')
      .filter({ hasText: 'Synthetic examination notes' })
      .getByText('Finalized', { exact: true }),
  ).toBeVisible();
});
