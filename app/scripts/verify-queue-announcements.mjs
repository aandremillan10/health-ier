/* eslint-disable @typescript-eslint/explicit-function-return-type -- Standalone browser verification. */
/* global document, window, getComputedStyle, innerHeight, innerWidth */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const assets = resolve(root, 'server/src/queue-display/public');
const evidence = resolve(root, 'docs/verification/queue-display');
await mkdir(evidence, { recursive: true });
const files = new Map([
  ['/', ['index.html', 'text/html']],
  ...['display.js', 'announcements.js', 'display.css'].map((file) => [
    `/queue-display/${file}`,
    [file, file.endsWith('css') ? 'text/css' : 'text/javascript'],
  ]),
]);
const server = createServer(async (request, response) => {
  const audio = request.url?.match(
    /^\/queue-display\/audio\/en\/(now-serving|letter-[mdl]|digit-[0-9]|medical|dental|laboratory)\.wav$/,
  );
  const file = audio
    ? [`audio/en/${audio[1]}.wav`, 'audio/wav']
    : files.get(request.url);
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(resolve(assets, file[0]));
    response.writeHead(200, {
      'Content-Type': file[1],
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'",
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const baseURL = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--mute-audio'],
});
const base = {
  date: '2026-10-15',
  updatedAt: '2026-10-15T02:30:00.000Z',
  departments: [
    { discipline: 'medical', serving: ['M100'], waiting: ['M101'] },
    { discipline: 'dental', serving: [], waiting: [] },
    { discipline: 'laboratory', serving: [], waiting: [] },
  ],
};
const screenshots = [];
const checks = [];
async function session({ mock = true, unsupported = false } = {}) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const state = {
    payload: structuredClone(base),
    apiError: false,
    audioError: false,
    holdAudio: false,
    releases: [],
    fetches: [],
  };
  if (mock) {
    await page.clock.install({ time: new Date(base.updatedAt) });
    await page.addInitScript(
      ({ unsupported }) => {
        window.__hidden = false;
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get: () => window.__hidden,
        });
        const test = (window.__audioTest = {
          contexts: [],
          sources: [],
          played: [],
          stopped: [],
          active: 0,
          maxActive: 0,
          resumeGesture: [],
          resumeError: false,
          resumeHold: false,
          decodeError: false,
          startError: false,
        });
        class MockAudioContext {
          state = 'suspended';
          destination = {};
          onstatechange = null;
          constructor() {
            test.contexts.push(this);
          }
          resume() {
            test.resumeGesture.push(navigator.userActivation.isActive);
            if (test.resumeHold) return new Promise(() => {});
            if (test.resumeError) return Promise.reject(new Error('Blocked'));
            this.state = 'running';
            return Promise.resolve();
          }
          close() {
            this.state = 'closed';
            return Promise.resolve();
          }
          decodeAudioData(bytes) {
            if (test.decodeError) return Promise.reject(new Error('Bad WAV'));
            return Promise.resolve({
              duration: 10,
              clip: new TextDecoder().decode(bytes),
            });
          }
          createBufferSource() {
            const source = {
              buffer: null,
              onended: null,
              running: false,
              connect() {},
              disconnect() {},
              start() {
                if (test.startError) throw new Error('Playback blocked');
                this.running = true;
                test.active += 1;
                test.maxActive = Math.max(test.maxActive, test.active);
                test.played.push(this.buffer.clip);
                test.sources.push(this);
              },
              stop() {
                if (this.running) {
                  this.running = false;
                  test.active -= 1;
                  test.stopped.push(this.buffer.clip);
                }
                this.onended?.();
              },
              finish() {
                if (this.running) {
                  this.running = false;
                  test.active -= 1;
                  this.onended?.();
                }
              },
            };
            return source;
          }
        }
        window.AudioContext = unsupported ? undefined : MockAudioContext;
        window.webkitAudioContext = undefined;
        test.finishAll = () => {
          let count = 0;
          while (test.sources.some((source) => source.running)) {
            if (++count > 200) throw new Error('Audio did not finish');
            test.sources.find((source) => source.running).finish();
          }
        };
      },
      { unsupported },
    );
    await page.route('**/queue-display/audio/en/*.wav', async (route) => {
      const name = new URL(route.request().url()).pathname
        .split('/')
        .at(-1)
        .replace('.wav', '');
      state.fetches.push(name);
      assert.equal(route.request().headers().cookie, undefined);
      if (state.holdAudio)
        await new Promise((done) => state.releases.push(done));
      await route
        .fulfill({
          status: state.audioError ? 503 : 200,
          contentType: 'audio/wav',
          body: name,
        })
        .catch(() => {});
    });
  }
  await page.route('**/queue-display/data', (route) =>
    state.apiError
      ? route.fulfill({ status: 503 })
      : route.fulfill({ json: state.payload }),
  );
  await page.goto(baseURL);
  await expect(page.locator('#connection-status')).toContainText('Connected');
  return { page, state, errors };
}
async function poll(page) {
  await page.clock.runFor(5001);
  await page.waitForTimeout(50);
}
async function serving(session, medical = [], dental = [], laboratory = []) {
  session.state.payload.departments.forEach((department, index) => {
    department.serving = [medical, dental, laboratory][index];
    department.waiting = [];
  });
  await poll(session.page);
}
async function played(page) {
  return page.evaluate(() => window.__audioTest.played);
}
async function clearPlayed(page) {
  await page.evaluate(() => {
    window.__audioTest.played = [];
  });
}
async function finish(page) {
  await page.evaluate(() => window.__audioTest.finishAll());
}
async function enable(page) {
  await page.locator('#announcements-toggle').click();
  await expect(page.locator('#audio-status')).toContainText('On ·');
}
const sequence = (ticket, department) => [
  'now-serving',
  `letter-${ticket[0].toLowerCase()}`,
  ...Array.from(ticket.slice(1), (digit) => `digit-${digit}`),
  department,
];
async function capture(page, name) {
  const path = resolve(evidence, `${name}.png`);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    `${name}: horizontal fit`,
  );
  if (page.viewportSize().width >= 1280)
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollHeight > innerHeight,
      ),
      false,
      `${name}: TV vertical fit`,
    );
  await page.screenshot({ path, fullPage: true });
  screenshots.push(path);
}
try {
  const test = await session();
  const { page, state } = test;
  assert.deepEqual(await played(page), []);
  assert.equal(state.fetches.length, 0);
  await capture(page, 'audio-off-1280');
  await page.keyboard.press('Tab');
  await expect(page.locator('#announcements-toggle')).toBeFocused();
  assert.equal(
    await page
      .locator('#announcements-toggle')
      .evaluate((button) => getComputedStyle(button).outlineWidth),
    '3px',
  );
  await page.keyboard.press('Enter');
  await expect(page.locator('#audio-status')).toContainText('On ·');
  assert.deepEqual(await played(page), []);
  assert.equal(state.fetches.length, 17);
  assert.deepEqual(
    await page.evaluate(() => window.__audioTest.resumeGesture),
    [true],
  );
  await serving(test, ['M100', 'M001']);
  await finish(page);
  assert.deepEqual(await played(page), sequence('M001', 'medical'));
  await clearPlayed(page);
  await serving(test, ['M100', 'M001'], ['D001'], ['L1000', 'M002']);
  await finish(page);
  assert.deepEqual(await played(page), [
    ...sequence('D001', 'dental'),
    ...sequence('L1000', 'laboratory'),
    ...sequence('M002', 'laboratory'),
  ]);
  assert.equal(await page.evaluate(() => window.__audioTest.maxActive), 1);
  checks.push(
    'gesture resume and17 lazy cached clips',
    'leading zeros / >999 / Lab original prefix',
    'multiple jobs sequential without overlap',
  );
  await clearPlayed(page);
  await poll(page);
  state.payload.departments[0].waiting = ['M900'];
  await poll(page);
  assert.deepEqual(await played(page), []);
  checks.push('initial board / unchanged / waiting-only silent');
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await capture(page, `audio-on-${viewport.width}`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await serving(test, ['M201', 'M202']);
  await serving(test);
  await finish(page);
  assert.deepEqual(await played(page), ['now-serving']);
  assert.equal(await page.evaluate(() => window.__audioTest.active), 0);
  await clearPlayed(page);
  await serving(test, ['M301']);
  await serving(test, [], [], ['M301']);
  await finish(page);
  assert.deepEqual(await played(page), [
    'now-serving',
    ...sequence('M301', 'laboratory'),
  ]);
  await clearPlayed(page);
  await serving(test, ['M301']);
  await finish(page);
  assert.deepEqual(await played(page), sequence('M301', 'medical'));
  checks.push(
    'removed active and pending jobs cancelled',
    'inflight department handoff and return to provider',
  );
  await clearPlayed(page);
  await serving(test, ['M401', 'M402']);
  await page.locator('#announcements-toggle').click();
  await serving(test, ['M403']);
  await finish(page);
  assert.deepEqual(await played(page), ['now-serving']);
  await clearPlayed(page);
  await enable(page);
  assert.deepEqual(await played(page), []);
  assert.equal(state.fetches.length, 17);
  checks.push(
    'mute stops active and pending / muted baseline / reenable silent cached',
  );
  await serving(test, ['M404']);
  state.apiError = true;
  await poll(page);
  assert.equal(await page.evaluate(() => window.__audioTest.active), 0);
  state.apiError = false;
  state.payload.departments[0].serving = ['M405'];
  await poll(page);
  await finish(page);
  assert.deepEqual(await played(page), ['now-serving']);
  await clearPlayed(page);
  await serving(test, ['M406']);
  const valid = state.payload;
  state.payload = { ...valid, patientName: 'Rejected' };
  await poll(page);
  state.payload = valid;
  await poll(page);
  await finish(page);
  assert.deepEqual(await played(page), ['now-serving']);
  await clearPlayed(page);
  await serving(test, ['M407']);
  state.payload.date = '2026-10-16';
  state.payload.updatedAt = '2026-10-15T16:00:01.000Z';
  state.payload.departments[0].serving = ['M001'];
  await poll(page);
  await finish(page);
  assert.deepEqual(await played(page), ['now-serving']);
  checks.push(
    'disconnect / malformed / day rollover cancel active and establish silent baseline',
  );
  await clearPlayed(page);
  await serving(test, ['M002']);
  await page.evaluate(() => {
    window.__hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal(await page.evaluate(() => window.__audioTest.active), 0);
  await serving(test, ['M003']);
  await page.evaluate(() => {
    window.__hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(50);
  await finish(page);
  assert.deepEqual(await played(page), ['now-serving']);
  await clearPlayed(page);
  await serving(test, ['M004']);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  assert.equal(await page.evaluate(() => window.__audioTest.active), 0);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(50);
  await finish(page);
  assert.deepEqual(await played(page), ['now-serving']);
  checks.push('hidden / offline stop immediately and resume silently');
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
  assert.deepEqual(test.errors, []);
  await page.reload();
  await expect(page.locator('#audio-status')).toContainText('Off ·');
  assert.equal(
    await page.evaluate(() => window.__audioTest.contexts.length),
    0,
  );
  await page.close();

  const loading = await session();
  loading.state.holdAudio = true;
  await loading.page.locator('#announcements-toggle').click();
  await expect(loading.page.locator('#audio-status')).toContainText('Loading');
  await capture(loading.page, 'audio-loading-1280');
  await serving(loading, ['M500']);
  loading.state.holdAudio = false;
  loading.state.releases.forEach((release) => release());
  await expect(loading.page.locator('#audio-status')).toContainText('On ·');
  assert.deepEqual(await played(loading.page), []);
  await poll(loading.page);
  assert.deepEqual(await played(loading.page), []);
  await loading.page.close();
  const cancelled = await session();
  cancelled.state.holdAudio = true;
  await cancelled.page.locator('#announcements-toggle').click();
  await expect.poll(() => cancelled.state.fetches.length).toBe(17);
  await cancelled.page.locator('#announcements-toggle').click();
  await expect(cancelled.page.locator('#audio-status')).toContainText('Off ·');
  cancelled.state.holdAudio = false;
  cancelled.state.releases.forEach((release) => release());
  await cancelled.page.waitForTimeout(50);
  await expect(cancelled.page.locator('#announcements-toggle')).toHaveText(
    'Enable announcements',
  );
  await enable(cancelled.page);
  assert.deepEqual(await played(cancelled.page), []);
  await cancelled.page.close();
  checks.push(
    'updates during audio loading remain silent / cancel loading ignores late completion / reload stays muted / reduced motion',
  );

  const unsupported = await session({ unsupported: true });
  await expect(
    unsupported.page.locator('#announcements-toggle'),
  ).toBeDisabled();
  await expect(unsupported.page.locator('#audio-status')).toContainText(
    'unsupported',
  );
  await capture(unsupported.page, 'audio-unsupported-1280');
  await unsupported.page.close();
  for (const failure of [
    'resumeError',
    'decodeError',
    'fetch',
    'resumeHold',
    'playback',
    'context',
    'watchdog',
  ]) {
    const failed = await session();
    if (failure === 'fetch') failed.state.audioError = true;
    if (['resumeError', 'decodeError', 'resumeHold'].includes(failure))
      await failed.page.evaluate((key) => {
        window.__audioTest[key] = true;
      }, failure);
    await failed.page.locator('#announcements-toggle').click();
    if (failure === 'resumeHold') await failed.page.clock.runFor(10001);
    if (['playback', 'context', 'watchdog'].includes(failure)) {
      await expect(failed.page.locator('#audio-status')).toContainText('On ·');
      if (failure === 'playback')
        await failed.page.evaluate(() => {
          window.__audioTest.startError = true;
        });
      await serving(failed, ['M600']);
      if (failure === 'context')
        await failed.page.evaluate(() => {
          const context = window.__audioTest.contexts.at(-1);
          context.state = 'suspended';
          context.onstatechange();
        });
      if (failure === 'watchdog') {
        // Let mocked network requests settle between timer ticks; otherwise advancing
        // past a request deadline simulates a disconnect that correctly cancels audio.
        for (let second = 0; second < 13; second += 1) {
          await failed.page.clock.runFor(1000);
          await failed.page.waitForTimeout(20);
        }
      }
    }
    await expect(
      failed.page.locator('#announcements-toggle'),
      `Audio failure case: ${failure}`,
    ).toHaveText('Retry announcements');
    assert.equal(
      await failed.page.evaluate(() => window.__audioTest.active),
      0,
    );
    if (failure === 'fetch') {
      await capture(failed.page, 'audio-error-1280');
      await failed.page.setViewportSize({ width: 390, height: 844 });
      await capture(failed.page, 'audio-error-390');
      failed.state.audioError = false;
      await enable(failed.page);
      assert.deepEqual(await played(failed.page), []);
    }
    assert.deepEqual(failed.errors, []);
    await failed.page.close();
  }
  checks.push(
    'unsupported / rejected resume / decode / fetch / hung resume / playback / suspended context / watchdog errors and explicit retry',
  );

  // Real Chrome decoding/playback with OS output muted: no speaker or voice-engine dependency.
  const native = await session({ mock: false });
  await native.page.evaluate(() => {
    window.__nativeAudio = { decoded: 0, started: 0 };
    const decode = window.AudioContext.prototype.decodeAudioData;
    window.AudioContext.prototype.decodeAudioData = async function (bytes) {
      const buffer = await decode.call(this, bytes);
      window.__nativeAudio.decoded += 1;
      return buffer;
    };
    const create = window.AudioContext.prototype.createBufferSource;
    window.AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this);
      const start = source.start;
      source.start = function (...args) {
        window.__nativeAudio.started += 1;
        return start.apply(this, args);
      };
      return source;
    };
  });
  await enable(native.page);
  assert.equal(
    await native.page.evaluate(() => window.__nativeAudio.decoded),
    17,
  );
  native.state.payload.departments[0].serving = ['M001'];
  await expect
    .poll(() => native.page.evaluate(() => window.__nativeAudio.started), {
      timeout: 20000,
    })
    .toBe(6);
  await native.page.locator('#announcements-toggle').click();
  assert.deepEqual(native.errors, []);
  await native.page.close();
  checks.push(
    'real17WAV decode and six-clip native WebAudio playback under --mute-audio',
  );
  await writeFile(
    resolve(evidence, 'announcements-results.json'),
    JSON.stringify({ passed: true, checks, screenshots }, null, 2),
  );
  console.log(`Queue announcement checks passed. Evidence: ${evidence}`);
} finally {
  await browser.close();
  server.close();
}
