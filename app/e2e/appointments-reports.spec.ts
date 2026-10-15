import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { createDemoClinic } from '../src/renderer/clinic/demo';
import type { ClinicApi } from '../src/renderer/clinic/contract';
import type { Appointment } from '../src/shared/appointments-api';

const evidence = resolve(
  __dirname,
  '../../docs/verification/sorting-charts-2026-10-15',
);

declare global {
  interface Window {
    operationalFixture: {
      reads: number;
      writes: number;
      mode: 'normal' | 'zero' | 'empty' | 'error';
    };
  }
}

// Failure modes: lexical time ordering across offsets, unstable ties, draft
// loss on reorder, sorting lost on refresh, and misleading/invalid chart data.
function install(fixture: ReturnType<typeof createDemoClinic>): void {
  const control: Window['operationalFixture'] = (window.operationalFixture = {
    reads: 0,
    writes: 0,
    mode: 'normal',
  });
  const records: Appointment[] = (
    [
      {
        id: 'appointment-c',
        patientId: 'DEMO-0003',
        patientName: 'Zora Flores',
        discipline: 'medical',
        status: 'waiting',
        scheduledAt: '2026-10-15T09:00:00+08:00',
      },
      {
        id: 'appointment-b',
        patientId: 'DEMO-0002',
        patientName: 'Ana Reyes',
        discipline: 'laboratory',
        status: 'scheduled',
        scheduledAt: '2026-10-15T10:00:00+08:00',
      },
      {
        id: 'appointment-d',
        patientId: 'DEMO-0003',
        patientName: 'Mateo Ramos',
        discipline: 'medical',
        status: 'waiting',
        scheduledAt: '2026-10-15T09:00:00+08:00',
      },
      {
        id: 'appointment-a',
        patientId: 'DEMO-0001',
        patientName: 'Ana Reyes',
        discipline: 'dental',
        status: 'arrived',
        scheduledAt: '2026-10-15T00:30:00Z',
      },
    ] as const
  ).map((record, index) => ({
    ...record,
    patientDateOfBirth: null,
    queueNumber: index + 1,
    clinicId: 'Synthetic clinic',
    revision: 1,
    statusChangedAt: '2026-10-15T01:00:00Z',
    createdById: 'demo-clerk',
    createdByName: 'Synthetic clerk',
    updatedById: 'demo-clerk',
    updatedByName: 'Synthetic clerk',
    createdAt: '2026-10-15T00:00:00Z',
    updatedAt: '2026-10-15T01:00:00Z',
    history: [],
  }));
  const api: ClinicApi = {
    ...fixture.api,
    login: async () => ({
      ok: true,
      data: fixture.selectStaff('demo-doctor-1'),
    }),
    listAppointments: async ({ discipline }) => {
      control.reads++;
      return {
        ok: true,
        data: records.filter(
          (record) => !discipline || record.discipline === discipline,
        ),
      };
    },
    correctAppointment: async (input) => {
      control.writes++;
      return fixture.api.correctAppointment(input);
    },
    readReport: async (query) => {
      if (control.mode === 'error')
        return {
          ok: false,
          error: {
            code: 'UNAVAILABLE',
            message:
              'Synthetic report unavailable. Refresh applied report to retry.',
          },
        };
      const count =
        Math.round((Date.parse(query.to) - Date.parse(query.from)) / 86400000) +
        1;
      const daily =
        control.mode === 'empty'
          ? []
          : Array.from({ length: count }, (_, index) => ({
              date: new Date(Date.parse(query.from) + index * 86400000)
                .toISOString()
                .slice(0, 10),
              visits: control.mode === 'zero' ? 0 : [3, 8, 0, 2][index % 4],
            }));
      return {
        ok: true,
        data: {
          ...query,
          generatedAt: '2026-10-15T02:00:00Z',
          fingerprint: 'synthetic-report',
          totals: {
            visits: daily.reduce((sum, row) => sum + row.visits, 0),
            noShows: 0,
            pendingLabs: 0,
            averageLabMinutes: null,
            newPatients: 3,
            employees: 2,
            dependents: 1,
          },
          daily,
          departments:
            control.mode === 'empty'
              ? []
              : [
                  {
                    discipline: 'medical',
                    patients: control.mode === 'zero' ? 0 : 5,
                  },
                  {
                    discipline: 'dental',
                    patients: control.mode === 'zero' ? 0 : 3,
                  },
                  { discipline: 'laboratory', patients: 0 },
                ],
        },
      };
    },
  };
  window.clinicApi = api;
}

async function start(page: Page): Promise<void> {
  await page.route('**/main.tsx*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `import { createDemoClinic as testClinic } from '/clinic/demo.ts';\n(${install.toString()})(testClinic());\n${await response.text()}`,
    });
  });
  await page.goto('/');
  await page.getByLabel('Username', { exact: true }).fill('SYNTHETIC');
  await page.getByLabel('Password', { exact: true }).fill('SYNTHETIC-TEST');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('appointment sorting is reversible, keeps drafts and persists through refresh', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Clinic flow', exact: true }).click();
  await page.getByLabel('Clinic date', { exact: true }).fill('2026-10-15');
  await page.getByLabel('Refresh every 15 seconds').uncheck();
  const table = page.locator('.appointment-table');
  const names = table.locator('tbody tr td:nth-child(2) > strong');
  await expect(names).toHaveText([
    'Ana Reyes',
    'Zora Flores',
    'Mateo Ramos',
    'Ana Reyes',
  ]);
  const reads = await page.evaluate(() => window.operationalFixture.reads);
  await table
    .getByRole('button', { name: 'Sort by Time', exact: true })
    .click();
  await expect(names).toHaveText([
    'Ana Reyes',
    'Zora Flores',
    'Mateo Ramos',
    'Ana Reyes',
  ]);
  await expect(
    table.getByRole('columnheader', { name: 'Sort by Time' }),
  ).toHaveAttribute('aria-sort', 'descending');
  // Equal patient names are distinguished by patient number and appointment time.
  await expect(table.locator('tbody tr').first()).toContainText('DEMO-0002');
  await table
    .getByRole('button', { name: 'Sort by Patient', exact: true })
    .click();
  await expect(names).toHaveText([
    'Ana Reyes',
    'Ana Reyes',
    'Mateo Ramos',
    'Zora Flores',
  ]);
  await expect(table.locator('tbody tr').first()).toContainText('DEMO-0001');
  const target = table.locator('tbody tr').filter({ hasText: 'Zora Flores' });
  await target.getByText('Correct workflow state', { exact: true }).click();
  await target
    .getByLabel('Reason for correction')
    .fill('Retain this draft while sorting');
  await table
    .getByRole('button', { name: 'Sort by Patient', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(names).toHaveText([
    'Zora Flores',
    'Mateo Ramos',
    'Ana Reyes',
    'Ana Reyes',
  ]);
  await expect(target.getByLabel('Reason for correction')).toHaveValue(
    'Retain this draft while sorting',
  );
  await table
    .getByRole('button', { name: 'Sort by Discipline', exact: true })
    .click();
  await expect(names).toHaveText([
    'Ana Reyes',
    'Ana Reyes',
    'Zora Flores',
    'Mateo Ramos',
  ]);
  await table
    .getByRole('button', { name: 'Sort by Discipline', exact: true })
    .click();
  await expect(table.locator('tbody tr td:nth-child(3)')).toHaveText([
    'medical',
    'medical',
    'laboratory',
    'dental',
  ]);
  await table
    .getByRole('button', { name: 'Sort by Current state', exact: true })
    .click();
  await expect(table.locator('tbody tr').first()).toContainText('DEMO-0002');
  await table
    .getByRole('button', { name: 'Sort by Current state', exact: true })
    .click();
  await expect(names).toHaveText([
    'Zora Flores',
    'Mateo Ramos',
    'Ana Reyes',
    'Ana Reyes',
  ]);
  expect(await page.evaluate(() => window.operationalFixture.reads)).toBe(
    reads,
  );
  expect(await page.evaluate(() => window.operationalFixture.writes)).toBe(0);
  await page
    .getByRole('button', { name: 'Refresh daily flow', exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => window.operationalFixture.reads))
    .toBeGreaterThan(reads);
  await expect(
    table.getByRole('columnheader', { name: 'Sort by Current state' }),
  ).toHaveAttribute('aria-sort', 'descending');
  await expect(target.getByLabel('Reason for correction')).toHaveValue(
    'Retain this draft while sorting',
  );
  await expect(
    page.getByRole('figure', { name: 'Appointments by state', exact: true }),
  ).toContainText('Waiting');
  await expect(
    page
      .getByRole('figure', { name: 'Appointments by state', exact: true })
      .getByRole('listitem')
      .nth(2),
  ).toHaveText(/Waiting\s*2/);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({
    path: `${evidence}/appointment-sorting.png`,
    fullPage: true,
  });
  await target
    .getByRole('button', { name: 'Cancel state correction', exact: true })
    .click();
  await page.getByLabel('Discipline', { exact: true }).selectOption('medical');
  await expect(names).toHaveText(['Zora Flores', 'Mateo Ramos']);
  await expect(
    table.getByRole('columnheader', { name: 'Sort by Current state' }),
  ).toHaveAttribute('aria-sort', 'descending');
});

test('report charts keep exact data and handle a single day, zero values, and a long range', async ({
  page,
}) => {
  await start(page);
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  const chart = page.getByRole('img', {
    name: 'Visits trend chart',
    exact: true,
  });
  await expect(chart).toBeVisible();
  await expect(
    page.getByRole('figure', { name: 'Patients by department', exact: true }),
  ).toContainText('5');
  await expect(
    page
      .getByRole('figure', { name: 'Patients by department', exact: true })
      .getByRole('listitem'),
  ).toHaveText([/medical\s*5/, /dental\s*3/, /laboratory\s*0/]);
  await mkdir(evidence, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: `${evidence}/report-charts-desktop.png`,
    fullPage: true,
  });
  await page.getByText('View daily data', { exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Daily visits; scroll for all dates' })
      .getByRole('row')
      .nth(1),
  ).toContainText('3');
  await page.getByText('View daily data', { exact: true }).click();
  await page.getByLabel('Start date', { exact: true }).fill('2026-10-15');
  await page.getByLabel('End date', { exact: true }).fill('2026-10-15');
  await page
    .getByRole('button', { name: 'Apply date range', exact: true })
    .click();
  await expect(chart.locator('circle')).toHaveCount(1);
  expect(await chart.locator('polyline').getAttribute('points')).not.toMatch(
    /NaN|Infinity/,
  );
  await page.evaluate(() => {
    window.operationalFixture.mode = 'zero';
  });
  await page
    .getByRole('button', { name: 'Refresh applied report', exact: true })
    .click();
  await expect(
    page.getByText(
      'No visits in this range. Zero values are shown for each reported day.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(chart).toBeVisible();
  await page.evaluate(() => {
    window.operationalFixture.mode = 'normal';
  });
  await page.getByLabel('Start date', { exact: true }).fill('2025-10-15');
  await page
    .getByRole('button', { name: 'Apply date range', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await chart.locator('polyline').getAttribute('points'))
          ?.trim()
          .split(/\s+/).length,
    )
    .toBe(53);
  await expect(
    page.getByRole('heading', { name: 'Visits by 7-day period', exact: true }),
  ).toBeVisible();
  await expect(chart.locator('desc')).toContainText('Highest period count: 26');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await mkdir(evidence, { recursive: true });
  await chart.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${evidence}/report-charts-320.png`,
    fullPage: true,
  });
  await page.evaluate(() => {
    window.operationalFixture.mode = 'empty';
  });
  await page
    .getByRole('button', { name: 'Refresh applied report', exact: true })
    .click();
  await expect(chart).toHaveCount(0);
  await expect(
    page.getByText(
      'No visits in this range. Choose another range to compare daily activity.',
      { exact: true },
    ),
  ).toBeVisible();
  await page.evaluate(() => {
    window.operationalFixture.mode = 'error';
  });
  await page
    .getByRole('button', { name: 'Refresh applied report', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Synthetic report unavailable',
  );
  await expect(chart).toHaveCount(0);
});
