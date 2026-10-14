import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve(
  __dirname,
  '../../docs/verification/ui-refinement-2026-10-15',
);

test('draft completion and patient identity remain reachable at desktop sizes and doubled text', async ({
  page,
}) => {
  await mkdir(evidence, { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page.getByRole('button', { name: 'New medical entry' }).click();
  await page
    .getByLabel('Reason / symptoms')
    .fill('Synthetic long editable clinical text. '.repeat(80));
  for (const [width, height, doubled] of [
    [1280, 720, false],
    [1920, 1080, false],
    [1024, 720, false],
    [1024, 720, true],
  ] as const) {
    await page.setViewportSize({ width, height });
    if (doubled)
      await page.addStyleTag({
        content: 'html { font-size: 32px !important; }',
      });
    await page.getByLabel('Findings', { exact: true }).focus();
    await page.getByLabel('Reason / symptoms').focus();
    await expect(page.getByLabel('Reason / symptoms')).toHaveValue(
      /Synthetic long editable/,
    );
    const save = page.getByRole('button', { name: 'Save draft', exact: true });
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
    await expect(save).toBeInViewport();
    await expect(cancel).toBeInViewport();
    await expect(page.locator('.patient-banner')).toBeInViewport();
    // The heading can leave the viewport while editing a lower field. The
    // active control itself must stay between the fixed identity and actions.
    for (const label of [
      'Reason / symptoms',
      'Findings',
      'Clinical impression',
      'Plan / instructions',
    ]) {
      await page.getByLabel(label, { exact: true }).focus();
      const bounds = await page.evaluate(() => {
        const input = document.activeElement!.getBoundingClientRect();
        const banner = document
          .querySelector('.patient-banner')!
          .getBoundingClientRect();
        const actions = document
          .querySelector('.sticky-form-actions')!
          .getBoundingClientRect();
        return {
          top: input.top,
          bottom: input.bottom,
          bannerBottom: banner.bottom,
          actionsTop: actions.top,
        };
      });
      expect(
        bounds.top,
        `${label} below patient identity`,
      ).toBeGreaterThanOrEqual(bounds.bannerBottom);
      expect(
        bounds.bottom,
        `${label} above completion actions`,
      ).toBeLessThanOrEqual(bounds.actionsTop);
    }
    await page.getByLabel('Reason / symptoms').focus();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `${evidence}/UI-A03-draft-${width}x${height}${doubled ? '-text200' : ''}.png`,
    });
  }
});

test('fit width stays within preview region and 100 percent preserves full paper and long text', async ({
  page,
}) => {
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page.getByRole('button', { name: 'Prepare prescription' }).click();
  await page
    .getByLabel('Medication instructions')
    .fill(
      Array.from(
        { length: 60 },
        (_, i) =>
          `Synthetic line ${i + 1}: complete clinician entered instructions.`,
      ).join('\n'),
    );
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  const region = page.getByRole('region', {
    name: 'Document preview',
    exact: true,
  });
  const paper = page.getByTestId('document-paper');
  await expect(paper).toContainText('Synthetic line 60');
  await expect
    .poll(async () =>
      region.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    )
    .toBe(true);
  await page.getByRole('button', { name: '100%', exact: true }).click();
  await expect
    .poll(async () =>
      paper.evaluate((el) => Math.round(el.getBoundingClientRect().width)),
    )
    .toBe(800);
  await expect(
    page.getByRole('button', { name: '100%', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Fit width', exact: true }).click();
  await expect
    .poll(async () =>
      region.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    )
    .toBe(true);
  await paper.getByRole('img').evaluate((el: HTMLImageElement) => el.decode());
  await page.screenshot({ path: `${evidence}/UI-A04-preview-1280x720.png` });
});
