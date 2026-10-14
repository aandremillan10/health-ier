import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve(__dirname, '../../../verification');
test.beforeAll(async (): Promise<void> => {
  await mkdir(evidence, { recursive: true });
});

async function capture(page: Page, name: string): Promise<void> {
  const header = page.getByTestId('document-paper').getByRole('img');
  if (await header.count())
    await header.evaluate((image: HTMLImageElement) => image.decode());
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
}

// Failure modes: stale writes, outage false-success, cross-user leakage, overwritten originals,
// cross-author issuance, duplicate issuance on printer retry, and clipped keyboard controls.
async function fixture(page: Page, name: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Demo staff').selectOption({ label: name });
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await expect(
    page.getByRole('heading', { name: 'Patient records', exact: true }),
  ).toBeVisible();
}
async function patient(page: Page): Promise<void> {
  await page.getByLabel('Find a patient').fill('DEMO-0001');
  await page.getByRole('button', { name: 'Find patient', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001' })
    .click();
}

test('frontend demo opens with patients and a chart can open without searching', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Dr. Mira Dalisay · Medical doctor · Clinic head');
  await expect(
    page.getByRole('heading', { name: 'Demo patients', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open Lina Marquez DEMO-0001' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Lina Marquez', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await expect(
    page.getByText('Synthetic examination notes for demonstration.', {
      exact: true,
    }),
  ).toBeVisible();
});

test('registry search, duplicate identity, registration and safe clerk context', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Alina Mercado · Clerk');
  await page.getByLabel('Find a patient').fill('Lina');
  await page.getByRole('button', { name: 'Find patient', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Open Lina Marquez/ }),
  ).toHaveCount(2);
  await capture(page, 'registry');
  await page
    .getByRole('button', { name: 'Register patient', exact: true })
    .click();
  await page.getByLabel('Full name').fill('Demo Patient New');
  await page.getByLabel('Sex').selectOption('unknown');
  await page.getByRole('button', { name: 'Check existing records' }).click();
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Demo Patient New' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Medical chart', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText('Synthetic examination notes for demonstration.'),
  ).toHaveCount(0);
});

test('author lifecycle preserves finalized original and attributed correction', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Dr. Mira Dalisay · Medical doctor · Clinic head');
  await patient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .first()
    .click();
  await page.getByRole('button', { name: 'New medical entry' }).click();
  await page.getByLabel('Reason / symptoms').fill('E2E original reason');
  await page.getByLabel('Findings').fill('E2E original findings');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const row = page
    .getByTestId('entry')
    .filter({ hasText: 'E2E original reason' });
  await row.getByRole('button', { name: 'Finalize entry' }).click();
  await page.getByRole('button', { name: 'Confirm finalization' }).click();
  await row.getByRole('button', { name: 'Add correction' }).click();
  await page
    .getByLabel('Correction reason')
    .fill('E2E transcription correction');
  await page.getByLabel('Findings').fill('E2E corrected findings');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(
    row.getByText('E2E original findings', { exact: true }),
  ).toBeVisible();
  await expect(
    row.getByText('E2E corrected findings', { exact: true }),
  ).toBeVisible();
  await row.getByRole('button', { name: 'Add correction' }).click();
  await expect(page.getByLabel('Findings')).toHaveValue(
    'E2E corrected findings',
  );
  await page.getByLabel('Correction reason').fill('E2E second correction');
  await page.getByLabel('Plan / instructions').fill('E2E corrected plan');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(
    row.getByText('E2E corrected findings', { exact: true }),
  ).toHaveCount(1);
  await expect(
    row.getByText('E2E corrected plan', { exact: true }),
  ).toBeVisible();
  await capture(page, 'medical-chart');
});

test('server disconnection keeps unsaved input; conflict requires review', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Alina Mercado · Clerk');
  await patient(page);
  await page.getByRole('button', { name: 'Edit patient details' }).click();
  await page.getByLabel('Address').fill('E2E retained address');
  await page.getByText('Demo controls', { exact: true }).click();
  await page.getByLabel('Internet available').uncheck();
  await page.getByLabel('Clinic server available').uncheck();
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Keep your input' }),
  ).toContainText('unavailable');
  await expect(page.getByLabel('Address')).toHaveValue('E2E retained address');
  await page.getByLabel('Clinic server available').check();
  await page
    .getByRole('button', { name: 'Simulate next revision conflict' })
    .click();
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await page.getByRole('button', { name: 'Review latest version' }).click();
  await expect(page.getByLabel('Address')).toHaveValue('E2E retained address');
  await page
    .getByRole('button', { name: 'Use latest revision and keep my input' })
    .click();
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(
    page.getByText('E2E retained address', { exact: true }),
  ).toBeVisible();
});

test('conflict stays blocked when latest version cannot be loaded', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Alina Mercado · Clerk');
  await patient(page);
  await page.getByRole('button', { name: 'Edit patient details' }).click();
  await page.getByLabel('Address').fill('Retained through conflict and outage');
  await page.getByText('Demo controls', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Simulate next revision conflict' })
    .click();
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await page.getByLabel('Clinic server available').uncheck();
  await page.getByRole('button', { name: 'Review latest version' }).click();
  await expect(
    page.getByRole('button', { name: 'Save patient', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Clinic server available').check();
  await page.getByRole('button', { name: 'Review latest version' }).click();
  await page
    .getByRole('button', { name: 'Use latest revision and keep my input' })
    .click();
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(
    page.getByText('Retained through conflict and outage', { exact: true }),
  ).toBeVisible();
});

test('document preview, issuance and retry keep one issued identity', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Dr. Mira Dalisay · Medical doctor · Clinic head');
  await patient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .first()
    .click();
  const own = page
    .getByTestId('entry')
    .filter({ hasText: 'Synthetic follow-up consultation' });
  await own.getByRole('button', { name: 'Prepare prescription' }).click();
  await page
    .getByLabel('Medication instructions')
    .fill('Synthetic medication instructions.');
  await page.getByText('Demo controls', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Simulate next revision conflict' })
    .click();
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await expect(page.getByLabel('Medication instructions')).toHaveValue(
    'Synthetic medication instructions.',
  );
  await page
    .getByRole('button', { name: 'Review latest consultation' })
    .click();
  await page
    .getByRole('button', {
      name: 'Use latest revision and keep my document text',
    })
    .click();
  await page.getByText('Demo controls', { exact: true }).click();
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  await expect(page.getByTestId('document-paper')).toContainText(
    'Synthetic medication instructions.',
  );
  await expect(
    page.getByTestId('document-paper').getByRole('img'),
  ).toHaveAttribute('src', /header/);
  await page.getByLabel('I have reviewed this document').check();
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  await expect(
    page.getByLabel('I have reviewed this document'),
  ).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Issue prescription' }),
  ).toBeDisabled();
  await page.getByLabel('I have reviewed this document').check();
  await page.getByRole('button', { name: 'Issue prescription' }).click();
  const documentId = await page.getByTestId('document-id').textContent();
  await page.getByText('Demo controls', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Simulate next print failure' })
    .click();
  await page
    .getByRole('button', { name: 'Print prescription', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm print' }).click();
  await expect(page.getByRole('alert')).toContainText('Printer unavailable');
  await page
    .getByRole('button', { name: 'Print prescription', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm print' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Demo print submission' }),
  ).toBeVisible();
  await expect(page.getByTestId('document-id')).toHaveText(documentId ?? '');
  await capture(page, 'prescription');
  await page.pdf({
    path: `${evidence}/prescription.pdf`,
    preferCSSPageSize: true,
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page
    .getByLabel('Demo staff')
    .selectOption({ label: 'Dr. Leo Ventura · Medical doctor' });
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await patient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page.getByRole('button', { name: 'View / reprint' }).click();
  await expect(page.getByTestId('document-id')).toHaveText(documentId ?? '');
  await expect(
    page.getByRole('button', { name: 'Issue prescription' }),
  ).toHaveCount(0);
  await expect(page.getByTestId('document-paper')).toContainText(
    'Dr. Mira Dalisay',
  );
});

test('oversight and session switching cannot retain clinical content', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Dr. Mira Dalisay · Medical doctor · Clinic head');
  await patient(page);
  await page
    .getByRole('button', { name: 'Laboratory chart', exact: true })
    .first()
    .click();
  await expect(
    page.getByText('Isolated laboratory proof record.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add correction' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page
    .getByLabel('Demo staff')
    .selectOption({ label: 'Alina Mercado · Clerk' });
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await expect(
    page.getByText('Isolated laboratory proof record.', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Lina Marquez', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Laboratory chart', exact: true }),
  ).toHaveCount(0);
});

test('layout, keyboard focus and browser data stay within renderer boundaries', async ({
  page,
}): Promise<void> => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fixture(page, 'Dr. Leo Ventura · Medical doctor');
  await patient(page);
  for (const width of [1920, 1280, 1024, 640, 320]) {
    await page.setViewportSize({ width, height: 720 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await expect(
    page.getByRole('button', { name: 'Laboratory chart', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .first()
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Medical chart', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(errors).toEqual([]);
});

test('vitals handoff keeps untaken values null and allows finalized selection', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Celia Moreno · Nursing attendant');
  await patient(page);
  await page.getByRole('button', { name: 'Vital signs', exact: true }).click();
  await page.getByRole('button', { name: 'Record vital signs' }).click();
  await page.getByLabel('Systolic pressure (mmHg)').fill('142');
  await page.getByLabel('Diastolic pressure (mmHg)').fill('88');
  await page.getByLabel('Oxygen saturation (%)').fill('101');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  expect(
    await page
      .getByLabel('Oxygen saturation (%)')
      .evaluate((element: HTMLInputElement) => element.validity.valid),
  ).toBe(false);
  await page.getByLabel('Oxygen saturation (%)').fill('');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  const measurements = page.getByTestId('vitals').filter({ hasText: '142' });
  await expect(
    measurements.getByText('Not taken', { exact: true }),
  ).toHaveCount(5);
  await measurements.getByRole('button', { name: 'Finalize entry' }).click();
  await page.getByRole('button', { name: 'Confirm finalization' }).click();
  await expect(
    measurements.getByText('Finalized', { exact: true }),
  ).toBeVisible();
  await measurements.getByRole('button', { name: 'Add correction' }).click();
  await page
    .getByLabel('Correction reason')
    .fill('Synthetic pressure correction');
  await page.getByLabel('Systolic pressure (mmHg)').fill('145');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await measurements.getByRole('button', { name: 'Add correction' }).click();
  await expect(page.getByLabel('Systolic pressure (mmHg)')).toHaveValue('145');
  await page
    .getByLabel('Correction reason')
    .fill('Synthetic weight correction');
  await page.getByLabel('Weight (kg)').fill('70');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(measurements.getByText('142', { exact: true })).toBeVisible();
  await expect(measurements.getByText('145', { exact: true })).toHaveCount(1);
  await capture(page, 'vitals');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page
    .getByLabel('Demo staff')
    .selectOption({ label: 'Dr. Leo Ventura · Medical doctor' });
  await page.getByRole('button', { name: 'Open frontend demo' }).click();
  await patient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page.getByRole('button', { name: 'New medical entry' }).click();
  await page.getByLabel('Finalized vital signs').selectOption({ index: 1 });
  await page.getByLabel('Reason / symptoms').fill('Synthetic vitals handoff');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(
    page.getByTestId('entry').filter({ hasText: 'Synthetic vitals handoff' }),
  ).not.toContainText('None selected');
  await expect(
    page.getByTestId('entry').filter({ hasText: 'Synthetic vitals handoff' }),
  ).not.toContainText('demo-vitals-');
  await expect(
    page.getByTestId('entry').filter({ hasText: 'Synthetic vitals handoff' }),
  ).toContainText('Celia Moreno');
});

test('200 percent text remains usable and long print content is preserved', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Dr. Mira Dalisay · Medical doctor · Clinic head');
  await patient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page.getByRole('button', { name: 'New medical entry' }).click();
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  await page.setViewportSize({ width: 1024, height: 720 });
  expect(
    await page
      .getByLabel('Reason / symptoms')
      .evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe('32px');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const positions = await page
    .locator('.form-grid .field')
    .evaluateAll((fields) =>
      fields.map((field) => field.getBoundingClientRect().left),
    );
  expect(new Set(positions).size).toBe(1);
  await capture(page, 'text-zoom-medical-form');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page
    .getByTestId('entry')
    .filter({ hasText: 'Synthetic follow-up consultation' })
    .getByRole('button', { name: 'Prepare prescription' })
    .click();
  const text = Array.from(
    { length: 60 },
    (_, index) =>
      `Synthetic instruction ${index + 1}: clinician-entered text for page-flow verification.`,
  ).join('\n');
  await page.getByLabel('Medication instructions').fill(text);
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  await expect(page.getByTestId('document-paper')).toContainText(
    'Synthetic instruction 60:',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await capture(page, 'text-zoom-document');
  await page.addStyleTag({ content: 'html { font-size: 16px !important; }' });
  await page.pdf({
    path: `${evidence}/long-prescription.pdf`,
    preferCSSPageSize: true,
  });
});

test('certificate body uses unified header and editable purpose', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Dr. Mira Dalisay · Medical doctor · Clinic head');
  await patient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page
    .getByTestId('entry')
    .filter({ hasText: 'Synthetic follow-up consultation' })
    .getByRole('button', { name: 'Prepare certificate' })
    .click();
  await page
    .getByLabel('Findings and clinical impression')
    .fill('Synthetic certificate findings.');
  await page.getByLabel('Remarks').fill('Synthetic remarks.');
  await page.getByLabel('Certificate purpose').fill('Synthetic leave request');
  await page.getByRole('button', { name: 'Preview certificate' }).click();
  await expect(page.getByTestId('document-paper')).toContainText(
    'and not to be used for medico-legal purposes.',
  );
  await expect(page.getByTestId('document-paper')).toContainText(
    'Synthetic leave request',
  );
  await expect(
    page.getByRole('button', { name: 'Issue certificate' }),
  ).toBeDisabled();
  await page.getByLabel('I have reviewed this document').check();
  await page.getByRole('button', { name: 'Issue certificate' }).click();
  await capture(page, 'certificate');
  await page.pdf({
    path: `${evidence}/certificate.pdf`,
    preferCSSPageSize: true,
  });
  await page.getByRole('button', { name: 'Back to chart' }).click();
  await page
    .getByRole('button', { name: 'Patient details', exact: true })
    .click();
  await expect(
    page.getByText('Demo address, Iloilo City', { exact: true }),
  ).toBeVisible();
});

test('missing document header blocks issuance and can retry without losing text', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Dr. Mira Dalisay · Medical doctor · Clinic head');
  await patient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page
    .getByTestId('entry')
    .filter({ hasText: 'Synthetic follow-up consultation' })
    .getByRole('button', { name: 'Prepare prescription' })
    .click();
  await page.route('**/header.jpg', (route) => route.abort());
  await page
    .getByLabel('Medication instructions')
    .fill('Header retry preserves this text');
  await page.getByRole('button', { name: 'Preview prescription' }).click();
  await page.getByLabel('I have reviewed this document').check();
  await expect(
    page.getByRole('button', { name: 'Issue prescription' }),
  ).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText(
    'Document header could not load',
  );
  await page.unroute('**/header.jpg');
  await page.getByRole('button', { name: 'Retry document header' }).click();
  await expect(
    page.getByRole('button', { name: 'Issue prescription' }),
  ).toBeEnabled();
  await expect(page.getByLabel('Medication instructions')).toHaveValue(
    'Header retry preserves this text',
  );
});

test('all eight staff views follow the frontend access matrix', async ({
  page,
}): Promise<void> => {
  const profiles = [
    [
      'Dr. Mira Dalisay · Medical doctor · Clinic head',
      ['Medical chart', 'Dental chart', 'Laboratory chart'],
    ],
    ['Dr. Leo Ventura · Medical doctor', ['Medical chart']],
    ['Dr. Ada Soriano · Dentist', ['Dental chart']],
    ['Dr. Noel Acosta · Dentist', ['Dental chart']],
    ['Maya Rivera · Medical technologist', ['Laboratory chart']],
    ['Ramon Cruz · Medical technologist', ['Laboratory chart']],
    ['Celia Moreno · Nursing attendant', []],
    ['Alina Mercado · Clerk', []],
  ] as const;
  await page.goto('/');
  for (const [name, allowed] of profiles) {
    await page.getByLabel('Demo staff').selectOption({ label: name });
    await page.getByRole('button', { name: 'Open frontend demo' }).click();
    await patient(page);
    for (const label of ['Medical chart', 'Dental chart', 'Laboratory chart']) {
      await expect(
        page.getByRole('button', { name: label, exact: true }),
      ).toHaveCount(allowed.some((item) => item === label) ? 1 : 0);
    }
    if (name.includes('Medical technologist')) {
      await expect(
        page.getByText('Demo address, Iloilo City', { exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole('button', { name: 'Laboratory chart', exact: true })
        .click();
      await expect(
        page.getByText('Isolated laboratory proof record.', { exact: true }),
      ).toBeVisible();
    }
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(
      page.getByText('Isolated laboratory proof record.', { exact: true }),
    ).toHaveCount(0);
  }
});

test('rendered text, focus and input boundaries meet contrast targets', async ({
  page,
}): Promise<void> => {
  await fixture(page, 'Dr. Mira Dalisay · Medical doctor · Clinic head');
  await patient(page);
  await page
    .getByRole('button', { name: 'Medical chart', exact: true })
    .click();
  await page.getByRole('button', { name: 'New medical entry' }).click();
  await page.getByLabel('Reason / symptoms').focus();
  const ratios = await page.evaluate(() => {
    const context = document.createElement('canvas').getContext('2d')!;
    function rgb(color: string): number[] {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    }
    function luminance(color: string): number {
      const components = rgb(color).map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return (
        components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722
      );
    }
    function ratio(foreground: string, background: string): number {
      const values = [luminance(foreground), luminance(background)].sort(
        (a, b) => b - a,
      );
      return (values[0] + 0.05) / (values[1] + 0.05);
    }
    function background(element: Element): string {
      const ancestors: Element[] = [];
      for (
        let parent: Element | null = element;
        parent;
        parent = parent.parentElement
      )
        ancestors.unshift(parent);
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 1, 1);
      for (const parent of ancestors) {
        context.fillStyle = getComputedStyle(parent).backgroundColor;
        context.fillRect(0, 0, 1, 1);
      }
      const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
      return `rgb(${red}, ${green}, ${blue})`;
    }
    const text = [
      ...document.querySelectorAll('.hint, .field label, .badge, .nav-item'),
    ]
      .filter((element) => element.getBoundingClientRect().height > 0)
      .map((element) => ({
        label: element.textContent?.trim(),
        ratio: ratio(getComputedStyle(element).color, background(element)),
      }));
    const input = document.getElementById('reason')!;
    const style = getComputedStyle(input);
    return {
      text,
      input: ratio(style.borderTopColor, background(input)),
      focus: ratio(style.outlineColor, background(input)),
      focusWidth: style.outlineWidth,
    };
  });
  await writeFile(
    `${evidence}/contrast-results.json`,
    JSON.stringify(ratios, null, 2),
  );
  for (const item of ratios.text)
    expect(item.ratio, item.label).toBeGreaterThanOrEqual(4.5);
  expect(ratios.input).toBeGreaterThanOrEqual(3);
  expect(ratios.focus).toBeGreaterThanOrEqual(3);
  expect(ratios.focusWidth).toBe('3px');
});
