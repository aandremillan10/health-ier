import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve(
  __dirname,
  '../../docs/verification/ui-redesign-2026-10-15',
);

// Failure modes: hidden pointer access to search, lost dialog focus, patient
// navigation mixed with clinic tasks, and controls outside a narrow viewport.
test('visible quick search restores focus and opens patient context', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  const trigger = page.getByRole('button', {
    name: 'Search patients',
    exact: true,
  });
  await trigger.click();
  const search = page.getByRole('combobox', {
    name: 'Search patient name or number',
  });
  await expect(search).toBeFocused();
  await search.press('Escape');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await search.fill('DEMO-0001');
  await page.getByRole('option', { name: /Lina Marquez/ }).click();
  const navigation = page.getByRole('navigation', {
    name: 'Patient navigation',
    exact: true,
  });
  await expect(
    page
      .locator('main')
      .getByRole('navigation', { name: 'Patient navigation' }),
  ).toBeVisible();
  await navigation
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await expect(
    navigation.getByRole('button', { name: 'Medical chart', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.patient-banner')).toContainText('DEMO-0001');
  await expect(
    page.getByText('Synthetic examination notes for demonstration.', {
      exact: true,
    }),
  ).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(navigation).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.locator('.patient-banner')).toHaveCount(0);
  await expect(navigation).toHaveCount(0);
});

test('narrow navigation and registry keep all controls reachable', async ({
  page,
}) => {
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  const menu = page.getByRole('button', { name: 'Clinic menu', exact: true });
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(
    page.getByRole('navigation', { name: 'Clinic navigation', exact: true }),
  ).toBeHidden();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page
    .getByRole('button', { name: 'Patient records', exact: true })
    .click();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await page
    .getByRole('heading', { name: 'Demo patients', exact: true })
    .waitFor();
  const open = page.getByRole('button', {
    name: 'Open Lina Marquez DEMO-0001',
    exact: true,
  });
  await open.scrollIntoViewIfNeeded();
  const bounds = await open.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${evidence}/after-registry-320.png`,
    fullPage: true,
  });
  await open.click();
  await page
    .getByRole('navigation', { name: 'Patient navigation', exact: true })
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `${evidence}/after-chart-320.png`,
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Search patients', exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Search patient name or number' })
    .fill('Lina');
  await expect(page.getByRole('option', { name: /Lina/ })).toHaveCount(2);
  expect(
    await page
      .getByRole('dialog')
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({ path: `${evidence}/after-search-320.png` });
});

for (const doubledText of [false, true]) {
  test(`patient navigation focus clears sticky identity${doubledText ? ' with doubled text and a long name' : ''}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: doubledText ? 1024 : 1280,
      height: 720,
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open frontend demo' }).click();
    await page
      .getByRole('button', { name: 'Open Lina Marquez DEMO-0001', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Medical chart', exact: true })
      .click();
    if (doubledText) {
      await page.addStyleTag({
        content: 'html { font-size: 32px !important; }',
      });
      // Layout stress input only; no patient record is changed.
      await page.locator('.patient-banner h1').evaluate((heading) => {
        heading.textContent = 'Lina Marquez Villanueva de los Santos';
      });
    }
    await page
      .getByRole('button', { name: 'New medical entry', exact: true })
      .focus();
    await page.evaluate(() => {
      const target = document.querySelector(
        '.patient-navigation button:last-child',
      )!;
      window.scrollTo(0, scrollY + target.getBoundingClientRect().top - 12);
    });
    await page.keyboard.press('Shift+Tab');
    await expect(
      page.getByRole('button', { name: 'Historical documents', exact: true }),
    ).toBeFocused();
    const bounds = await page.evaluate(() => ({
      control: document.activeElement!.getBoundingClientRect().toJSON(),
      identity: document
        .querySelector('.patient-banner')!
        .getBoundingClientRect()
        .toJSON(),
    }));
    expect(bounds.control.top).toBeGreaterThanOrEqual(bounds.identity.bottom);
    expect(bounds.control.bottom).toBeLessThanOrEqual(720);
  });
}
