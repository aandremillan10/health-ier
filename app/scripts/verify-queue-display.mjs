/* eslint-disable @typescript-eslint/explicit-function-return-type -- Standalone JavaScript browser verification. */
/* global document, window, innerWidth, innerHeight, getComputedStyle */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const assets = resolve(root, 'server/src/queue-display/public');
const evidence = resolve(root, 'docs/verification/queue-display');
await mkdir(evidence, { recursive: true });
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/queue-display/display.css', ['display.css', 'text/css']],
  ['/queue-display/display.js', ['display.js', 'text/javascript']],
  ['/queue-display/announcements.js', ['announcements.js', 'text/javascript']],
]);
const server = createServer(async (request, response) => {
  const file = files.get(request.url);
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'Content-Type': file[1],
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'",
  });
  response.end(await readFile(resolve(assets, file[0])));
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  timezoneId: 'America/Los_Angeles',
});
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
const data = {
  date: '2026-10-15',
  updatedAt: '2026-10-15T02:30:00.000Z',
  departments: [
    {
      discipline: 'medical',
      serving: ['M001'],
      waiting: ['M002', 'M003', 'M004', 'M005', 'M006', 'M007', 'M008', 'M009'],
    },
    {
      discipline: 'dental',
      serving: ['D002', 'D003'],
      waiting: ['D004', 'D005'],
    },
    {
      discipline: 'laboratory',
      serving: ['L001', 'M010'],
      waiting: ['L002', 'L003', 'D001'],
    },
  ],
};
let payload = structuredClone(data);
let mode = 'hold';
let release;
let requests = 0;
await page.route('**/queue-display/data', async (route) => {
  requests += 1;
  if (mode === 'hold')
    await new Promise((done) => {
      release = done;
    });
  if (mode === 'error')
    await route.fulfill({ status: 503, body: 'Unavailable' });
  else await route.fulfill({ json: payload }).catch(() => {});
});
const results = [];
async function capture(name) {
  const path = resolve(evidence, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  results.push({ screenshot: name, path });
}
async function checkConnected() {
  await expect(page.locator('#connection-status')).toHaveText(
    'Connected · Updates automatically',
  );
}
async function checkDisconnected() {
  await expect(page.locator('#connection-title')).toHaveText(
    'Queue display disconnected',
  );
  await expect(page.locator('#departments')).toBeHidden();
  assert.equal(await page.locator('.serving-numbers li').count(), 0);
}
async function nextPoll() {
  await page.clock.runFor(5001);
  await page.waitForTimeout(50);
}
async function noHorizontalOverflow() {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
}
function contrast(foreground, background) {
  const luminance = (color) => {
    const channels = color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (values[0] + 0.05) / (values[1] + 0.05);
}
try {
  await page.clock.install({ time: new Date('2026-10-15T02:30:00.000Z') });
  await page.goto(`http://127.0.0.1:${address.port}`);
  await expect(page.locator('#connection-title')).toHaveText(
    'Connecting to the clinic…',
  );
  await capture('loading-1920');
  mode = 'success';
  release();
  await checkConnected();
  const colors = await page.evaluate(() => {
    const canvas = getComputedStyle(document.documentElement).backgroundColor;
    const serving = getComputedStyle(document.querySelector('.serving'));
    const footer = getComputedStyle(document.querySelector('.display-footer'));
    return {
      canvas,
      ink: getComputedStyle(document.documentElement).color,
      servingInk: serving.color,
      servingBackground: serving.backgroundColor,
      muted: footer.color,
    };
  });
  assert.ok(contrast(colors.ink, colors.canvas) >= 4.5);
  assert.ok(contrast(colors.muted, colors.canvas) >= 4.5);
  assert.ok(contrast(colors.servingInk, colors.servingBackground) >= 4.5);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('*')).some(
        (element) =>
          getComputedStyle(element).animationName !== 'none' ||
          getComputedStyle(element).transitionDuration !== '0s',
      ),
    ),
    false,
  );
  await expect(page.locator('#clinic-date')).toContainText('October 15, 2026');
  await expect(page.locator('#last-updated')).toContainText('10:30:00');
  assert.equal(
    await page
      .locator('[data-discipline="medical"] .waiting-numbers li')
      .count(),
    6,
  );
  await expect(
    page.locator('[data-discipline="medical"] .waiting-more'),
  ).toHaveText('2 more waiting');
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await noHorizontalOverflow();
    if (
      viewport.width >= 1280 &&
      (await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight,
      ))
    ) {
      failures.push(
        `TV height overflow at ${viewport.width}: ${await page.evaluate(() => document.documentElement.scrollHeight)}`,
      );
    }
    await capture(`connected-${viewport.width}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    window.__queueFirstNode = document.querySelector('.serving-numbers li');
  });
  await nextPoll();
  assert.equal(
    await page.evaluate(
      () =>
        window.__queueFirstNode ===
        document.querySelector('.serving-numbers li'),
    ),
    true,
    'Unchanged polls preserve number nodes',
  );
  payload.departments = payload.departments.map((department) => ({
    ...department,
    serving: [],
    waiting: [],
  }));
  await nextPoll();
  await expect(page.locator('.serving-empty:visible')).toHaveCount(3);
  await capture('empty-1280');
  payload = structuredClone(data);
  await nextPoll();
  mode = 'error';
  await nextPoll();
  await checkDisconnected();
  await capture('disconnected-1280');
  await page.keyboard.press('Tab');
  await expect(page.locator('#retry')).toBeFocused();
  assert.equal(
    await page
      .locator('#retry')
      .evaluate((button) => getComputedStyle(button).outlineWidth),
    '3px',
  );
  mode = 'success';
  await page.keyboard.press('Enter');
  await checkConnected();
  for (const invalid of [
    { ...data, departments: [...data.departments, data.departments[0]] },
    {
      ...data,
      departments: data.departments.map((department, index) =>
        index
          ? department
          : { ...department, serving: ['<script>bad</script>'] },
      ),
    },
    { ...data, date: '2026-10-14' },
    { ...data, patientName: 'Must never render' },
    {
      ...data,
      departments: data.departments.map((department, index) =>
        index ? department : { ...department, serving: ['D001'] },
      ),
    },
  ]) {
    payload = invalid;
    await nextPoll();
    await checkDisconnected();
    assert.equal(await page.getByText('Must never render').count(), 0);
    payload = structuredClone(data);
    await page.locator('#retry').click();
    await checkConnected();
  }
  payload = {
    ...structuredClone(data),
    date: '2026-10-16',
    updatedAt: '2026-10-15T16:00:01.000Z',
  };
  payload.departments[0].serving = ['M1000'];
  await nextPoll();
  await expect(page.locator('#clinic-date')).toContainText('October 16, 2026');
  await expect(
    page.locator('[data-discipline="medical"] .serving-numbers'),
  ).toHaveText('M1000');
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await checkDisconnected();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await checkConnected();
  payload = structuredClone(data);
  payload.departments[0].serving = Array.from(
    { length: 20 },
    (_, index) => `M${String(index + 100).padStart(3, '0')}`,
  );
  payload.departments[0].waiting = Array.from(
    { length: 250 },
    (_, index) => `M${index + 1000}`,
  );
  await nextPoll();
  assert.equal(
    await page
      .locator('[data-discipline="medical"] .serving-numbers li')
      .count(),
    20,
  );
  await expect(
    page.locator('[data-discipline="medical"] .waiting-more'),
  ).toHaveText('244 more waiting');
  await noHorizontalOverflow();
  mode = 'hold';
  await nextPoll();
  const requestCount = requests;
  await page.clock.runFor(4001);
  await checkDisconnected();
  assert.equal(
    requests,
    requestCount,
    'Timed-out fetch does not overlap with a second fetch',
  );
  mode = 'success';
  release();
  await nextPoll();
  await checkConnected();
  assert.deepEqual(failures, []);
  await writeFile(
    resolve(evidence, 'results.json'),
    JSON.stringify(
      {
        passed: true,
        checks: [
          'loading',
          'TV viewport fit',
          'mobile horizontal overflow',
          'Manila date/time on US browser',
          'multiple serving',
          'bounded waiting',
          'unchanged DOM',
          'empty',
          '503/disconnected hiding',
          'keyboard retry/focus',
          'malformed response rejection',
          'recovery',
          'date rollover',
          'numbers above 999',
          'offline/online',
          '20 simultaneous serving and 250 waiting',
          'timeout and no overlap',
          'no browser errors',
          'rendered text contrast',
          'static reduced-motion display',
        ],
        results,
      },
      null,
      2,
    ),
  );
  console.log(`Queue display checks passed. Screenshots: ${evidence}`);
} finally {
  await browser.close();
  server.close();
}
