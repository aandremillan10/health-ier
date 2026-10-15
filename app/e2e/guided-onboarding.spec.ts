import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import type { createDemoClinic } from '../src/renderer/clinic/demo';
import type { HistoricalDocument } from '../src/shared/historical-documents-api';

declare global {
  interface Window {
    guidedTest: {
      calls: string[];
      effects: string[];
      expired: boolean;
      roleId: string;
      scanBase64: string;
      scanSha256: string;
      scanMime: 'application/pdf' | 'image/jpeg';
      reset: () => void;
    };
  }
}

// A separate fixture stands in for live state; practice must never call it.
function installLive(fixture: ReturnType<typeof createDemoClinic>): void {
  let reset: ((reason: string) => void) | undefined;
  const control = (window.guidedTest = {
    calls: [] as string[],
    effects: [] as string[],
    expired: false,
    roleId: 'demo-doctor-1',
    scanBase64: '',
    scanSha256: '',
    scanMime: 'application/pdf' as const as 'application/pdf' | 'image/jpeg',
    reset: (): void => reset?.('expired'),
  });
  const historicalRecord = (): HistoricalDocument => ({
    id: '30000000-0000-4000-8000-000000000099',
    patientId: 'DEMO-0001',
    discipline: 'medical',
    documentType: 'Synthetic preview proof',
    documentDate: '2026-10-01',
    description: 'Nonclinical generated fixture',
    filename:
      control.scanMime === 'application/pdf' ? 'proof.pdf' : 'proof.jpg',
    mimeType: control.scanMime,
    byteLength: atob(control.scanBase64).length,
    sha256: control.scanSha256,
    uploaderId: 'demo-doctor-1',
    uploaderName: 'Synthetic doctor',
    createdAt: '2026-10-15T00:00:00Z',
    replacesId: null,
    replacementReason: null,
  });
  const api = {
    ...fixture.api,
    listHistoricalDocuments: async (): Promise<
      Awaited<ReturnType<typeof fixture.api.listHistoricalDocuments>>
    > => ({
      ok: true,
      data: {
        documents: control.scanBase64 ? [historicalRecord()] : [],
        nextCursor: null,
      },
    }),
    readHistoricalDocument: async (): Promise<
      Awaited<ReturnType<typeof fixture.api.readHistoricalDocument>>
    > => ({ ok: true, data: historicalRecord() }),
    readHistoricalDocumentContent: async (): Promise<
      Awaited<ReturnType<typeof fixture.api.readHistoricalDocumentContent>>
    > => ({
      ok: true,
      data: { document: historicalRecord(), contentBase64: control.scanBase64 },
    }),
    login: async (): Promise<
      Awaited<ReturnType<typeof fixture.api.login>>
    > => ({
      ok: true,
      data: fixture.selectStaff(control.roleId),
    }),
    me: async (): Promise<Awaited<ReturnType<typeof fixture.api.me>>> =>
      control.expired
        ? {
            ok: false,
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Expired fixture session',
            },
          }
        : fixture.api.me(),
    onSessionReset: (listener: (reason: string) => void): (() => void) => {
      reset = listener;
      return (): void => {
        reset = undefined;
      };
    },
  };
  window.clinicApi = new Proxy(api, {
    get(target, key, receiver): unknown {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        control.calls.push(String(key));
        return (value as (...input: unknown[]) => unknown)(...args);
      };
    },
  }) as typeof fixture.api;
  window.print = (): void => {
    control.effects.push('print');
  };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (): Promise<void> => {
        control.effects.push('clipboard');
      },
    },
  });
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = (...args): ReturnType<typeof fetch> => {
    control.effects.push('fetch');
    return fetchOriginal(...args);
  };
  const sendOriginal = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    control.effects.push('xhr');
    sendOriginal.call(this, body);
  };
}

async function signIn(page: Page, roleId = 'demo-doctor-1'): Promise<void> {
  await page.route('**/main.tsx*', async (route): Promise<void> => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `import { createDemoClinic as testClinic } from '/clinic/demo.ts';\n(${installLive.toString()})(testClinic());\n${await response.text()}`,
    });
  });
  await page.goto('/');
  // Vite can reload once while preparing newly added lazy PDF dependencies.
  await page.waitForLoadState('networkidle');
  await page.evaluate((id) => {
    window.guidedTest.roleId = id;
  }, roleId);
  await page.getByLabel('Username', { exact: true }).fill('synthetic');
  await page
    .getByLabel('Password', { exact: true })
    .fill('SYNTHETIC-TEST-VALUE');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Patient records', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const privileged = new Proxy(
      {},
      {
        get:
          (_target, key): unknown =>
          async (): Promise<unknown> => {
            window.guidedTest.effects.push(`desktop.${String(key)}`);
            return {
              ok: false,
              error: {
                code: 'DENIED',
                message: 'Unexpected privileged practice call',
              },
            };
          },
      },
    );
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: new Proxy(
        { clinic: privileged, platform: 'win32' },
        {
          get(target, key): unknown {
            if (key === 'clinic' || key === 'platform')
              return Reflect.get(target, key);
            return async (): Promise<void> => {
              window.guidedTest.effects.push(`desktop.${String(key)}`);
            };
          },
        },
      ),
    });
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob: Blob): string => {
      window.guidedTest.effects.push('blob-url');
      return createObjectURL(blob);
    };
    window.open = (): null => {
      window.guidedTest.effects.push('window-open');
      return null;
    };
    document.addEventListener(
      'click',
      (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('a[download]')
        )
          window.guidedTest.effects.push('download');
      },
      true,
    );
  });
}

async function start(page: Page, topic: string): Promise<void> {
  if (
    (await page.locator('.context-help details').getAttribute('open')) === null
  )
    await page.getByText('How to use', { exact: true }).click();
  await page.getByLabel('Practice guides', { exact: true }).focus();
  await page.getByLabel('Practice guides', { exact: true }).selectOption(topic);
  await expect(page.getByTestId('practice-workspace')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Practice · fictional records' }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.guidedTest.calls = [];
    window.guidedTest.effects = [];
  });
}

async function noLiveEffects(page: Page): Promise<void> {
  const activity = await page.evaluate(() => ({
    calls: window.guidedTest.calls.filter((method) => method !== 'me'),
    effects: window.guidedTest.effects,
  }));
  expect(activity).toEqual({ calls: [], effects: [] });
}

test('registry practice requires real actions, isolates writes, and restarts cleanly', async ({
  page,
}): Promise<void> => {
  await signIn(page, 'demo-clerk');
  await start(page, 'registry');
  const guide = page.getByRole('complementary', {
    name: 'Practice guide',
    exact: true,
  });
  await expect(
    guide.getByRole('button', { name: 'Next', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Find a patient', { exact: true }).fill('Lina');
  await page.getByRole('button', { name: 'Find patient', exact: true }).click();
  await expect(guide.getByRole('status')).toContainText('Action completed');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001', exact: true })
    .click();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('button', { name: 'Edit patient details', exact: true })
    .click();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByLabel('Address', { exact: true })
    .fill('INDEPENDENT PRACTICE ADDRESS');
  await page.getByRole('button', { name: 'Save patient', exact: true }).click();
  await expect(guide.getByRole('status')).toContainText('Action completed');
  await noLiveEffects(page);
  await guide
    .getByRole('button', { name: 'Restart practice', exact: true })
    .click();
  await expect(page.getByLabel('Find a patient', { exact: true })).toHaveValue(
    '',
  );
  await expect(guide.getByRole('status')).toContainText('Step 1');
  await expect(
    guide.getByRole('button', { name: 'Next', exact: true }),
  ).toBeDisabled();
  await noLiveEffects(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('practice-workspace')).toHaveCount(0);
  await page.getByLabel('Find a patient', { exact: true }).fill('DEMO-0001');
  await page.getByRole('button', { name: 'Find patient', exact: true }).click();
  await page
    .getByRole('button', { name: 'Open Lina Marquez DEMO-0001', exact: true })
    .click();
  await expect(
    page.getByText('INDEPENDENT PRACTICE ADDRESS', { exact: true }),
  ).toHaveCount(0);
});

test('practice preserves an unsaved live editor, route, title and focus without duplicate controls', async ({
  page,
}): Promise<void> => {
  await signIn(page, 'demo-clerk');
  await page
    .getByRole('button', { name: 'Register patient', exact: true })
    .click();
  await page
    .getByLabel('Full name', { exact: true })
    .fill('UNSAVED LIVE DRAFT');
  const title = await page.title();
  await start(page, 'registry');
  await expect(page.getByLabel('Full name', { exact: true })).toHaveCount(0);
  await expect(page.locator('#main-content')).toHaveCount(1);
  await expect(page.locator('#patient-search')).toHaveCount(1);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('practice-workspace')).toHaveCount(0);
  await expect(page.getByLabel('Full name', { exact: true })).toHaveValue(
    'UNSAVED LIVE DRAFT',
  );
  await expect(page).toHaveTitle(title);
  await expect(
    page.getByLabel('Practice guides', { exact: true }),
  ).toBeFocused();
  await noLiveEffects(page);
});

for (const reason of ['reset', 'authority'] as const) {
  test(`genuine ${reason} closes practice and prevents private state revival`, async ({
    page,
  }): Promise<void> => {
    await signIn(page);
    await start(page, 'medical');
    if (reason === 'reset')
      await page.evaluate(() => window.guidedTest.reset());
    else
      await page.evaluate(() => {
        window.guidedTest.expired = true;
        window.dispatchEvent(new Event('focus'));
      });
    await expect(
      page.getByRole('heading', { name: 'Staff sign-in', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('practice-workspace')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Lina Marquez', exact: true }),
    ).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('practice-workspace')).toHaveCount(0);
  });
}

test('role-scoped guides exclude privileged tasks and simulated sign-out keeps real session', async ({
  page,
}): Promise<void> => {
  await signIn(page, 'demo-clerk');
  await page.getByText('How to use', { exact: true }).click();
  const choices = page.getByLabel('Practice guides', { exact: true });
  for (const disallowed of [
    'medical',
    'dental',
    'laboratory',
    'documents',
    'audit',
  ])
    await expect(choices.locator(`option[value="${disallowed}"]`)).toHaveCount(
      0,
    );
  await choices.selectOption('session');
  await expect(page.getByTestId('practice-workspace')).toBeVisible();
  await page.evaluate(() => {
    window.guidedTest.calls = [];
    window.guidedTest.effects = [];
  });
  const guide = page.getByRole('complementary', {
    name: 'Practice guide',
    exact: true,
  });
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('region', { name: 'Simulated session' })
    .getByRole('button', { name: 'Simulate sign-out', exact: true })
    .click();
  await expect(guide.getByRole('status')).toContainText('Action completed');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('button', { name: 'Simulate sign-in', exact: true })
    .click();
  await noLiveEffects(page);
  await guide
    .getByRole('button', { name: 'Finish practice', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Patient records', exact: true }),
  ).toBeVisible();
});

test('missing targets halt progress and reduced-motion narrow reflow retains a reachable exit', async ({
  page,
}): Promise<void> => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px';
  });
  await start(page, 'registry');
  const guide = page.getByRole('complementary', {
    name: 'Practice guide',
    exact: true,
  });
  await page.locator('#patient-search').evaluate((element) => element.remove());
  await expect(
    guide.getByText(/This control is not on the current screen/),
  ).toBeVisible();
  await expect(
    guide.getByRole('button', { name: 'Next', exact: true }),
  ).toBeDisabled();
  await guide
    .getByRole('button', { name: 'Exit practice', exact: true })
    .focus();
  await expect(
    guide.getByRole('button', { name: 'Exit practice', exact: true }),
  ).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('practice-workspace')).toHaveCount(0);
});

test('document practice reviews, invalidates, issues, reopens and simulates print without privileged effects', async ({
  page,
}): Promise<void> => {
  await signIn(page);
  await start(page, 'documents');
  const guide = page.getByRole('complementary', {
    name: 'Practice guide',
    exact: true,
  });
  await page
    .getByRole('button', { name: 'Prepare certificate', exact: true })
    .first()
    .click();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByLabel('Certificate purpose', { exact: true })
    .fill('INDEPENDENT PRACTICE PURPOSE');
  await page
    .getByRole('button', { name: 'Preview certificate', exact: true })
    .click();
  await expect(page.getByTestId('document-paper')).toContainText(
    'FICTIONAL PRACTICE COPY',
  );
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByLabel('I have reviewed this document', { exact: true })
    .check();
  await expect(
    page.getByRole('button', { name: 'Issue certificate', exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel('Certificate purpose', { exact: true })
    .fill('REVISED PRACTICE PURPOSE');
  await expect(
    page.getByRole('button', { name: 'Issue certificate', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Preview certificate', exact: true })
    .click();
  await page
    .getByLabel('I have reviewed this document', { exact: true })
    .check();
  await page
    .getByRole('button', { name: 'Issue certificate', exact: true })
    .click();
  await expect(guide.getByRole('status')).toContainText('Action completed');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByLabel('Printer', { exact: true })
    .selectOption('practice-printer');
  await page
    .getByRole('button', { name: 'Print certificate', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm print', exact: true })
    .click();
  await expect(guide.getByRole('status')).toContainText('Action completed');
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('button', { name: 'Copy document ID', exact: true })
    .click();
  await noLiveEffects(page);
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('button', { name: 'Back to chart', exact: true })
    .click();
  await guide.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('button', { name: 'View / reprint', exact: true })
    .click();
  await expect(page.getByTestId('document-paper')).toContainText(
    'REVISED PRACTICE PURPOSE',
  );
  await expect(guide.getByRole('status')).toContainText('Action completed');
  await noLiveEffects(page);
  await guide
    .getByRole('button', { name: 'Finish practice', exact: true })
    .click();
  await expect(page.getByTestId('document-paper')).toHaveCount(0);
});

test('every available guide seeds for each named role and disposed sessions cannot emit or act', async ({
  page,
}): Promise<void> => {
  await signIn(page);
  const results = await page.evaluate(async () => {
    const practiceModulePath = '/clinic/practice.ts';
    const demoModulePath = '/clinic/demo.ts';
    const { createPractice, availableTopics } = (await import(
      practiceModulePath
    )) as typeof import('../src/renderer/clinic/practice');
    const { demoStaff } = (await import(
      demoModulePath
    )) as typeof import('../src/renderer/clinic/demo');
    const checked: {
      role: string;
      topic: string;
      steps: number;
      closed: boolean;
      eventsAfterDispose: number;
    }[] = [];
    window.guidedTest.calls = [];
    window.guidedTest.effects = [];
    for (const staff of demoStaff) {
      for (const topic of availableTopics(staff)) {
        const session = await createPractice(
          { role: staff.role, isHead: staff.isHead },
          topic,
        );
        const events: string[] = [];
        session.subscribe((event) => events.push(event.method));
        session.dispose();
        session.emit({ method: 'stale-callback', ok: true });
        const response = await session.api.findPatients({ search: '' });
        checked.push({
          role: staff.id,
          topic,
          steps: session.steps.length,
          closed: !response.ok,
          eventsAfterDispose: events.length,
        });
      }
    }
    return checked;
  });
  expect(new Set(results.map((result) => result.role)).size).toBe(8);
  expect(
    new Set(results.map((result) => result.topic)).size,
  ).toBeGreaterThanOrEqual(13);
  for (const result of results) {
    expect(result.steps, `${result.role}/${result.topic}`).toBeGreaterThan(0);
    expect(result.closed, `${result.role}/${result.topic}`).toBe(true);
    expect(result.eventsAfterDispose, `${result.role}/${result.topic}`).toBe(0);
  }
  await noLiveEffects(page);
});

for (const role of [
  'demo-doctor-1',
  'demo-doctor-2',
  'demo-dentist-1',
  'demo-dentist-2',
  'demo-medtech-1',
  'demo-medtech-2',
  'demo-attendant',
  'demo-clerk',
]) {
  test(`each available ${role} guide mounts its first real target without live reads`, async ({
    page,
  }): Promise<void> => {
    await signIn(page, role);
    await page.getByText('How to use', { exact: true }).click();
    const topics = await page
      .getByLabel('Practice guides', { exact: true })
      .locator('option')
      .evaluateAll((options) =>
        options
          .map((option) => (option as HTMLOptionElement).value)
          .filter(Boolean),
      );
    for (const topic of topics) {
      await start(page, topic);
      const guide = page.getByRole('complementary', {
        name: 'Practice guide',
        exact: true,
      });
      await expect(
        guide.getByRole('button', { name: 'Show this control', exact: true }),
        `${role}/${topic}`,
      ).toBeVisible();
      await expect(
        guide.getByText(/This control is not on the current screen/),
        `${role}/${topic}`,
      ).toHaveCount(0);
      await noLiveEffects(page);
      await guide
        .getByRole('button', { name: 'Exit practice', exact: true })
        .click();
      await expect(page.getByTestId('practice-workspace')).toHaveCount(0);
    }
  });
}

async function nextStep(page: Page): Promise<void> {
  await page
    .getByRole('complementary', { name: 'Practice guide', exact: true })
    .getByRole('button', { name: 'Next', exact: true })
    .click();
}

async function finishStep(page: Page): Promise<void> {
  await expect(
    page
      .getByRole('complementary', { name: 'Practice guide', exact: true })
      .getByRole('status'),
  ).toContainText('Action completed');
  await noLiveEffects(page);
}

test('family eligibility update and history remain synthetic', async ({
  page,
}): Promise<void> => {
  await signIn(page, 'demo-clerk');
  await start(page, 'family');
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Check eligibility', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Update eligibility', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByLabel('Reason for change', { exact: true })
    .fill('Independent practice membership review');
  await page
    .getByRole('button', { name: 'Save family record', exact: true })
    .click();
  await finishStep(page);
  await page.locator('.family-history summary').first().click();
  await expect(
    page.getByText('Reason: Independent practice membership review', {
      exact: true,
    }),
  ).toBeVisible();
  await noLiveEffects(page);
});

test('clinic queue transitions and history do not touch live appointments', async ({
  page,
}): Promise<void> => {
  await signIn(page, 'demo-clerk');
  await start(page, 'appointments');
  await nextStep(page);
  await page.getByRole('button', { name: 'Mark arrived', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Mark arrived', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Move to waiting', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Move to waiting', exact: true })
    .click();
  await nextStep(page);
  await page
    .locator('summary')
    .filter({ hasText: /^State history/ })
    .click();
  await finishStep(page);
  await expect(page.locator('.appointment-history')).toContainText('Waiting');
});

test('vital practice validates nullable drafts then preserves finalized original and correction', async ({
  page,
}): Promise<void> => {
  await signIn(page, 'demo-attendant');
  await start(page, 'vitals');
  await page
    .getByRole('button', { name: 'Record vital signs', exact: true })
    .click();
  await nextStep(page);
  await page.getByLabel('Pulse (/min)', { exact: true }).fill('74');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await nextStep(page);
  const row = page.getByTestId('vitals').first();
  await row
    .getByRole('button', { name: 'Finalize entry', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm finalization', exact: true })
    .click();
  await nextStep(page);
  await row
    .getByRole('button', { name: 'Add correction', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByLabel('Correction reason', { exact: true })
    .fill('Independent transcription correction');
  await page.getByLabel('Pulse (/min)', { exact: true }).fill('75');
  await page
    .getByRole('button', { name: 'Save correction', exact: true })
    .click();
  await finishStep(page);
  await expect(row).toContainText('74');
  await expect(row).toContainText('75');
  await expect(row).toContainText('Independent transcription correction');
});

test('medical practice handles conflict review retry finalization and attributed correction locally', async ({
  page,
}): Promise<void> => {
  await signIn(page);
  await start(page, 'medical');
  await page
    .getByRole('button', { name: 'New medical entry', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByLabel('Finalized vital signs', { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel('Reason / symptoms', { exact: true })
    .fill('Independent local medical reason');
  await page
    .getByLabel('Findings', { exact: true })
    .fill('Independent original findings');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await nextStep(page);
  const row = page
    .getByTestId('entry')
    .filter({ hasText: 'Independent local medical reason' });
  await row.getByRole('button', { name: 'Edit draft', exact: true }).click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Simulate revision conflict', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Review latest version', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', {
      name: 'Use latest revision and keep my input',
      exact: true,
    })
    .click();
  await nextStep(page);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await nextStep(page);
  await row
    .getByRole('button', { name: 'Finalize entry', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm finalization', exact: true })
    .click();
  await nextStep(page);
  await row
    .getByRole('button', { name: 'Add correction', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByLabel('Correction reason', { exact: true })
    .fill('Independent practice correction');
  await page
    .getByLabel('Findings', { exact: true })
    .fill('Independent corrected findings');
  await page
    .getByRole('button', { name: 'Save correction', exact: true })
    .click();
  await finishStep(page);
  await expect(row).toContainText('Independent original findings');
  await expect(row).toContainText('Independent corrected findings');
});

test('dental read lesson honestly exposes authoring limitation and returns to identity', async ({
  page,
}): Promise<void> => {
  await signIn(page, 'demo-dentist-1');
  await start(page, 'dental');
  await expect(page.getByTestId('entry')).toContainText(
    'Isolated dental proof record.',
  );
  await nextStep(page);
  await expect(
    page.getByRole('complementary', { name: 'Practice guide' }),
  ).toContainText('Dental chart authoring is not available');
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Patient details', exact: true })
    .click();
  await finishStep(page);
});

test('provider laboratory practice creates an order and reviews a returned result locally', async ({
  page,
}): Promise<void> => {
  await signIn(page);
  await start(page, 'laboratory');
  await page
    .getByRole('button', { name: 'New laboratory order', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByLabel('Requested tests', { exact: true })
    .fill('Independent practice analyte');
  await page
    .getByRole('button', { name: 'Create laboratory order', exact: true })
    .click();
  await nextStep(page);
  await page
    .locator('.lab-order-option')
    .filter({ hasText: 'Practice reviewed test' })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Mark results reviewed', exact: true })
    .click();
  await finishStep(page);
});

test('medtech laboratory practice starts saves and finalizes a result locally', async ({
  page,
}): Promise<void> => {
  await signIn(page, 'demo-medtech-1');
  await start(page, 'laboratory');
  await page
    .locator('.lab-order-option')
    .filter({ hasText: 'Practice test' })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Start laboratory work', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Enter laboratory result', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByLabel('Result value', { exact: true })
    .fill('Independent fictional result');
  await page
    .getByRole('button', { name: 'Save result draft', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Finalize laboratory result', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm finalization', exact: true })
    .click();
  await finishStep(page);
  await expect(
    page.getByRole('region', { name: 'Finalized laboratory values' }),
  ).toContainText('Independent fictional result');
});

test('referral practice receives completes and sends a handoff locally', async ({
  page,
}): Promise<void> => {
  await signIn(page);
  await start(page, 'referrals');
  await page
    .locator('.referral-option')
    .filter({ hasText: 'Lina Marquez' })
    .first()
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Accept referral', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Start referral task', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Complete referral', exact: true })
    .click();
  await nextStep(page);
  await page
    .locator('#referral-completion-note')
    .fill('Independent fictional handoff completed');
  await page
    .getByRole('button', { name: 'Review completion', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm completion', exact: true })
    .click();
  await nextStep(page);
  await page.getByRole('button', { name: 'New referral', exact: true }).click();
  await nextStep(page);
  await page
    .getByLabel('Receiving unit', { exact: true })
    .selectOption('dental');
  await page
    .getByLabel('Reason / requested task', { exact: true })
    .fill('Independent fictional referral');
  await page
    .getByRole('button', { name: 'Send referral', exact: true })
    .click();
  await finishStep(page);
});

test('clinical summary creates sourced history while report export and audit stay local', async ({
  page,
}): Promise<void> => {
  await signIn(page);
  await start(page, 'summary');
  await nextStep(page);
  await page.getByRole('button', { name: 'Add allergy', exact: true }).click();
  await nextStep(page);
  await page
    .getByLabel('Substance', { exact: true })
    .fill('Independent fictional substance');
  await page
    .getByLabel('Source', { exact: true })
    .fill('Independent fictional record');
  await page
    .getByRole('button', { name: 'Save summary item', exact: true })
    .click();
  await nextStep(page);
  await page.locator('.summary-history summary').last().click();
  await finishStep(page);
  await page
    .getByRole('button', { name: 'Exit practice', exact: true })
    .click();
  await start(page, 'reports');
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Apply date range', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Export applied report as CSV', exact: true })
    .click();
  await finishStep(page);
  await page
    .getByRole('button', { name: 'Exit practice', exact: true })
    .click();
  await start(page, 'audit');
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Apply audit filters', exact: true })
    .click();
  await finishStep(page);
});

test('historical scan practice imports views replaces and cancels without picker files or PDF effects', async ({
  page,
}): Promise<void> => {
  await signIn(page);
  await start(page, 'historical');
  await page
    .getByRole('button', { name: 'Import historical document', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Choose fictional scan', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByLabel('Document type', { exact: true })
    .fill('Independent practice scan');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Independent fictional scan');
  await page
    .getByRole('button', { name: 'Save historical document', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'View original scan', exact: true })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'FICTIONAL HISTORICAL SCAN',
      exact: true,
    }),
  ).toBeVisible();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Close scan preview', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Import replacement', exact: true })
    .click();
  await nextStep(page);
  await page
    .getByRole('button', { name: 'Choose fictional scan', exact: true })
    .click();
  await page
    .getByLabel('Reason for replacement', { exact: true })
    .fill('Independent practice clearer scan');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Independent fictional replacement');
  await page
    .getByRole('button', { name: 'Save historical document', exact: true })
    .click();
  await finishStep(page);
  await expect(page.locator('.history-list > li')).toHaveCount(2);
  await expect(page.locator('.history-list')).toContainText(
    'Independent practice clearer scan',
  );
  await page
    .getByRole('button', { name: 'Import historical document', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Choose fictional scan', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Cancel import', exact: true })
    .click();
  await noLiveEffects(page);
});

test('a genuine reset during asynchronous practice startup rejects its late completion', async ({
  page,
}): Promise<void> => {
  await signIn(page);
  await page.getByText('How to use', { exact: true }).click();
  await page.evaluate(() => {
    const select = document.querySelector<HTMLSelectElement>('#practice-topic');
    if (!select) throw new Error('Missing guide chooser');
    select.value = 'medical';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    window.guidedTest.reset();
  });
  await expect(
    page.getByRole('heading', { name: 'Staff sign-in', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('practice-workspace')).toHaveCount(0);
  await page.getByLabel('Username', { exact: true }).fill('synthetic');
  await page
    .getByLabel('Password', { exact: true })
    .fill('SYNTHETIC-TEST-VALUE');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Patient records', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('practice-workspace')).toHaveCount(0);
});

for (const editor of ['patient', 'vitals', 'medical', 'document'] as const) {
  test(`practice entry and exit preserve unsaved live ${editor} editor and selected patient`, async ({
    page,
  }): Promise<void> => {
    await signIn(
      page,
      editor === 'patient'
        ? 'demo-clerk'
        : editor === 'vitals'
          ? 'demo-attendant'
          : 'demo-doctor-1',
    );
    await page.getByLabel('Find a patient', { exact: true }).fill('DEMO-0001');
    await page
      .getByRole('button', { name: 'Find patient', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Open Lina Marquez DEMO-0001', exact: true })
      .click();
    let field: string;
    let value: string;
    if (editor === 'patient') {
      await page
        .getByRole('button', { name: 'Edit patient details', exact: true })
        .click();
      field = 'Address';
      value = 'UNSAVED LIVE ADDRESS';
    } else if (editor === 'vitals') {
      await page
        .getByRole('button', { name: 'Vital signs', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Record vital signs', exact: true })
        .click();
      field = 'Pulse (/min)';
      value = '79';
    } else {
      await page
        .getByRole('button', { name: 'Medical chart', exact: true })
        .click();
      if (editor === 'medical') {
        await page
          .getByRole('button', { name: 'New medical entry', exact: true })
          .click();
        field = 'Reason / symptoms';
        value = 'UNSAVED LIVE CONSULTATION';
      } else {
        await page
          .getByRole('button', { name: 'Prepare certificate', exact: true })
          .first()
          .click();
        field = 'Certificate purpose';
        value = 'UNSAVED LIVE CERTIFICATE';
      }
    }
    await page.getByLabel(field, { exact: true }).fill(value);
    await start(page, 'registry');
    await page
      .getByRole('button', { name: 'Exit practice', exact: true })
      .click();
    await expect(page.getByLabel(field, { exact: true })).toHaveValue(value);
    await expect(
      page.getByRole('heading', { name: 'Lina Marquez', exact: true }),
    ).toBeVisible();
    await noLiveEffects(page);
  });
}

function previewPdf(): Buffer {
  const stream = '1 0 0 rg 10 10 60 60 re f\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let document = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(document));
    document += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(document);
  document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  document += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(document);
}

for (const format of ['PDF', 'JPEG'] as const) {
  test(`actual live-fixture ${format} bytes render in the safe scan preview`, async ({
    page,
  }): Promise<void> => {
    await signIn(page);
    const content =
      format === 'PDF'
        ? previewPdf().toString('base64')
        : await page.evaluate(() => {
            const canvas = document.createElement('canvas');
            canvas.width = 2;
            canvas.height = 2;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Missing fixture canvas');
            context.fillStyle = '#ff0000';
            context.fillRect(0, 0, 2, 2);
            return canvas.toDataURL('image/jpeg').split(',')[1];
          });
    await page.evaluate(
      ({ content, sha256, mime }) => {
        window.guidedTest.scanBase64 = content;
        window.guidedTest.scanSha256 = sha256;
        window.guidedTest.scanMime = mime;
      },
      {
        content,
        sha256: createHash('sha256')
          .update(Buffer.from(content, 'base64'))
          .digest('hex'),
        mime:
          format === 'PDF'
            ? ('application/pdf' as const)
            : ('image/jpeg' as const),
      },
    );
    await page.getByLabel('Find a patient', { exact: true }).fill('DEMO-0001');
    await page
      .getByRole('button', { name: 'Find patient', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Open Lina Marquez DEMO-0001', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Historical documents', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'View original scan', exact: true })
      .click();
    const preview = page.getByRole('region', {
      name: 'Original scan preview',
      exact: true,
    });
    await expect(
      preview.getByText('Preparing a safe scan preview…', { exact: true }),
    ).toHaveCount(0);
    await expect(preview.getByRole('alert')).toHaveCount(0);
    if (format === 'PDF') {
      await expect(
        preview.getByText('Page 1 of 1', { exact: true }),
      ).toBeVisible();
      await expect
        .poll(async () =>
          preview.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
            const context = canvas.getContext('2d');
            if (!context || !canvas.width || !canvas.height) return false;
            const pixels = context.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            ).data;
            for (let index = 0; index < pixels.length; index += 4)
              if (
                pixels[index] > 200 &&
                pixels[index + 1] < 50 &&
                pixels[index + 2] < 50
              )
                return true;
            return false;
          }),
        )
        .toBe(true);
    } else {
      await expect
        .poll(async () =>
          preview
            .locator('img')
            .evaluate(
              (image: HTMLImageElement) =>
                image.complete &&
                image.naturalWidth === 2 &&
                image.naturalHeight === 2,
            ),
        )
        .toBe(true);
    }
    const calls = await page.evaluate(() => window.guidedTest.calls);
    expect(
      calls.filter((method) => method === 'readHistoricalDocumentContent'),
    ).toHaveLength(1);
    expect(calls).not.toContain('selectHistoricalFile');
    await page
      .getByRole('button', { name: 'Close scan preview', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'View original scan', exact: true }),
    ).toBeFocused();
  });
}
