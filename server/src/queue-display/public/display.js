/* global document, window */
/* eslint-disable @typescript-eslint/explicit-function-return-type -- This is unbundled browser JavaScript. */
(() => {
  'use strict';

  const POLL_MS = 5000;
  const TIMEOUT_MS = 4000;
  const WAITING_PREVIEW = 6;
  const disciplines = ['medical', 'dental', 'laboratory'];
  const board = document.getElementById('departments');
  const message = document.getElementById('connection-message');
  const title = document.getElementById('connection-title');
  const help = document.getElementById('connection-help');
  const retry = document.getElementById('retry');
  const status = document.getElementById('connection-status');
  const clinicDate = document.getElementById('clinic-date');
  const updated = document.getElementById('last-updated');
  const announcements = window.createQueueAnnouncements?.(
    document.getElementById('announcements-toggle'),
    document.getElementById('audio-status'),
  );
  const dateFormatter = new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'full',
    timeZone: 'Asia/Manila',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Manila',
  });
  const dayFormatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Manila',
  });
  let timer;
  let activeRequest = null;
  let previousContent = '';

  function hasKeys(value, keys) {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key))
    );
  }

  function validTicket(value, discipline) {
    if (typeof value !== 'string' || !/^[MDL]\d{3,}$/.test(value)) return false;
    const number = Number(value.slice(1));
    return (
      Number.isSafeInteger(number) &&
      number > 0 &&
      String(number).padStart(3, '0') === value.slice(1) &&
      (discipline === 'laboratory' ||
        value[0] === (discipline === 'medical' ? 'M' : 'D'))
    );
  }

  function validData(value) {
    if (
      !hasKeys(value, ['date', 'updatedAt', 'departments']) ||
      typeof value.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      typeof value.updatedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(
        value.updatedAt,
      )
    )
      return false;
    const instant = new Date(value.updatedAt);
    if (
      !Number.isFinite(instant.getTime()) ||
      dayFormatter.format(instant) !== value.date
    )
      return false;
    if (
      !Array.isArray(value.departments) ||
      value.departments.length !== disciplines.length
    )
      return false;
    const seen = new Set();
    return value.departments.every((department) => {
      if (
        !hasKeys(department, ['discipline', 'serving', 'waiting']) ||
        !disciplines.includes(department.discipline) ||
        seen.has(department.discipline)
      )
        return false;
      seen.add(department.discipline);
      if (
        !Array.isArray(department.serving) ||
        !Array.isArray(department.waiting)
      )
        return false;
      const tickets = [...department.serving, ...department.waiting];
      return (
        tickets.every((ticket) => validTicket(ticket, department.discipline)) &&
        new Set(tickets).size === tickets.length
      );
    });
  }

  function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
  }

  function renderTickets(element, tickets) {
    element.replaceChildren(
      ...tickets.map((ticket) => {
        const item = document.createElement('li');
        item.textContent = ticket;
        return item;
      }),
    );
  }

  function disconnect() {
    announcements?.reset();
    board.hidden = true;
    previousContent = '';
    for (const list of board.querySelectorAll('ul, ol')) list.replaceChildren();
    message.hidden = false;
    setText(title, 'Queue display disconnected');
    setText(
      help,
      'Queue numbers are temporarily hidden. Please check with clinic staff. This display will reconnect automatically.',
    );
    retry.hidden = false;
    setText(status, 'Disconnected · Retrying automatically');
    setText(updated, 'Live queue unavailable · Manila time');
  }

  function render(data) {
    announcements?.update(data);
    const content = JSON.stringify([data.date, data.departments]);
    if (content !== previousContent) {
      for (const department of data.departments) {
        const section = board.querySelector(
          `[data-discipline="${department.discipline}"]`,
        );
        const serving = section.querySelector('.serving-numbers');
        renderTickets(serving, department.serving);
        serving.dataset.dense = String(
          department.serving.length > 2 ||
            department.serving.some((ticket) => ticket.length > 5),
        );
        section.querySelector('.serving-empty').hidden =
          department.serving.length !== 0;
        renderTickets(
          section.querySelector('.waiting-numbers'),
          department.waiting.slice(0, WAITING_PREVIEW),
        );
        section.querySelector('.waiting-empty').hidden =
          department.waiting.length !== 0;
        const more = section.querySelector('.waiting-more');
        more.hidden = department.waiting.length <= WAITING_PREVIEW;
        setText(
          more,
          `${department.waiting.length - WAITING_PREVIEW} more waiting`,
        );
      }
      previousContent = content;
    }
    setText(
      clinicDate,
      dateFormatter.format(new Date(`${data.date}T12:00:00+08:00`)),
    );
    setText(
      updated,
      `Updated ${timeFormatter.format(new Date(data.updatedAt))} · Manila`,
    );
    message.hidden = true;
    board.hidden = false;
    setText(status, 'Connected · Updates automatically');
  }

  async function poll() {
    if (activeRequest) return;
    clearTimeout(timer);
    const controller = new AbortController();
    activeRequest = controller;
    retry.disabled = true;
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch('/queue-display/data', {
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Queue unavailable');
      const data = await response.json();
      if (!validData(data) || controller.signal.aborted)
        throw new Error('Invalid queue');
      render(data);
    } catch {
      disconnect();
    } finally {
      clearTimeout(timeout);
      activeRequest = null;
      retry.disabled = false;
      timer = setTimeout(poll, POLL_MS);
    }
  }

  retry.addEventListener('click', poll);
  window.addEventListener('offline', () => {
    activeRequest?.abort();
    disconnect();
  });
  window.addEventListener('online', poll);
  document.addEventListener('visibilitychange', () => {
    announcements?.reset();
    if (!document.hidden) {
      disconnect();
      void poll();
    }
  });
  void poll();
})();
