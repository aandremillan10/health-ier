/* global document, window */
/* eslint-disable @typescript-eslint/explicit-function-return-type -- This is unbundled browser JavaScript. */
(() => {
  'use strict';

  window.createQueueAnnouncements = (button, status) => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const clips = [
      'now-serving',
      'letter-m',
      'letter-d',
      'letter-l',
      ...Array.from({ length: 10 }, (_, digit) => `digit-${digit}`),
      'medical',
      'dental',
      'laboratory',
    ];
    let mode = AudioContext ? 'muted' : 'unsupported';
    let context = null;
    let buffers = null;
    let loadController = null;
    let generation = 0;
    let snapshot = null;
    let jobs = [];
    let active = null;
    let playbackTimeout;

    function show(message) {
      const label =
        mode === 'enabled'
          ? 'Mute announcements'
          : mode === 'loading'
            ? 'Cancel announcements'
            : mode === 'error'
              ? 'Retry announcements'
              : 'Enable announcements';
      if (button.textContent !== label) button.textContent = label;
      button.disabled = mode === 'unsupported';
      button.setAttribute('aria-pressed', String(mode === 'enabled'));
      const text =
        message ||
        (mode === 'unsupported'
          ? 'Audio is unsupported. Use an up-to-date browser; the visual queue still works.'
          : mode === 'enabled'
            ? snapshot
              ? 'On · Offline English · New calls only.'
              : 'On · Waiting for a live queue. New calls only.'
            : mode === 'loading'
              ? 'Loading offline English audio. New calls only.'
              : 'Off · Enable to announce new calls only.');
      if (status.textContent !== text) status.textContent = text;
    }

    function stopActive() {
      clearTimeout(playbackTimeout);
      if (active?.source) {
        active.source.onended = null;
        try {
          active.source.stop();
        } catch {
          /* The source may already have ended. */
        }
        active.source.disconnect();
      }
      active = null;
    }

    function cancelJobs() {
      jobs = [];
      stopActive();
    }

    function fail(message) {
      mode = 'error';
      generation += 1;
      loadController?.abort();
      cancelJobs();
      if (context) {
        context.onstatechange = null;
        void context.close().catch(() => {});
      }
      context = null;
      buffers = null;
      show(message);
    }

    function playClip(job) {
      if (active !== job || mode !== 'enabled') return;
      const clip = job.clips.shift();
      if (!clip) {
        active = null;
        pump();
        return;
      }
      try {
        if (context.state !== 'running') throw new Error('Audio stopped');
        const source = context.createBufferSource();
        source.buffer = buffers.get(clip);
        source.connect(context.destination);
        job.source = source;
        source.onended = () => {
          if (active !== job || job.source !== source) return;
          clearTimeout(playbackTimeout);
          source.onended = null;
          source.disconnect();
          job.source = null;
          playClip(job);
        };
        playbackTimeout = setTimeout(
          () =>
            fail(
              'Audio stopped. Select Retry announcements to enable sound again.',
            ),
          source.buffer.duration * 1000 + 2000,
        );
        source.start();
      } catch {
        fail(
          'Audio stopped. Select Retry announcements to enable sound again.',
        );
      }
    }

    function pump() {
      if (active || mode !== 'enabled' || !jobs.length) return;
      active = jobs.shift();
      playClip(active);
    }

    async function enable() {
      const attempt = ++generation;
      mode = 'loading';
      cancelJobs();
      show();
      let timeout;
      try {
        context ??= new AudioContext();
        const audio = context;
        // Resume in the click handler's user gesture, before any fetch or await.
        const resumed = audio.resume();
        loadController = new AbortController();
        const controller = loadController;
        const deadline = new Promise((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new Error('Audio timeout'));
          }, 10000);
        });
        await Promise.race([resumed, deadline]);
        if (attempt !== generation) return;
        if (audio.state !== 'running') throw new Error('Audio blocked');
        if (!buffers) {
          const decoded = await Promise.race([
            Promise.all(
              clips.map(async (clip) => {
                const response = await fetch(
                  `/queue-display/audio/en/${clip}.wav`,
                  { credentials: 'omit', signal: controller.signal },
                );
                if (!response.ok) throw new Error('Audio unavailable');
                const buffer = await audio.decodeAudioData(
                  await response.arrayBuffer(),
                );
                if (
                  !Number.isFinite(buffer.duration) ||
                  buffer.duration <= 0 ||
                  buffer.duration > 15
                )
                  throw new Error('Invalid audio');
                return [clip, buffer];
              }),
            ),
            deadline,
          ]);
          if (attempt !== generation) return;
          buffers = new Map(decoded);
        }
        if (audio.state !== 'running') throw new Error('Audio blocked');
        mode = 'enabled';
        audio.onstatechange = () => {
          if (mode === 'enabled' && audio.state !== 'running')
            fail('Audio paused by the browser. Select Retry announcements.');
        };
        show();
      } catch {
        if (attempt === generation)
          fail(
            'Audio could not start. Check the clinic connection, then retry announcements.',
          );
      } finally {
        clearTimeout(timeout);
        if (attempt === generation) loadController = null;
      }
    }

    function mute() {
      mode = 'muted';
      generation += 1;
      loadController?.abort();
      loadController = null;
      cancelJobs();
      show();
    }

    function reset() {
      snapshot = null;
      cancelJobs();
      if (mode === 'enabled') show();
    }

    function update(data) {
      if (document.hidden) {
        reset();
        return;
      }
      const next = new Set(
        data.departments.flatMap((department) =>
          department.serving.map(
            (ticket) => `${department.discipline}:${ticket}`,
          ),
        ),
      );
      const baseline = !snapshot || snapshot.date !== data.date;
      if (baseline || mode !== 'enabled') cancelJobs();
      else {
        jobs = jobs.filter((job) => next.has(job.key));
        if (active && !next.has(active.key)) stopActive();
        for (const key of next) {
          if (snapshot.serving.has(key)) continue;
          const [department, ticket] = key.split(':');
          jobs.push({
            key,
            clips: [
              'now-serving',
              `letter-${ticket[0].toLowerCase()}`,
              ...Array.from(ticket.slice(1), (digit) => `digit-${digit}`),
              department,
            ],
            source: null,
          });
        }
      }
      snapshot = { date: data.date, serving: next };
      if (mode === 'enabled') show();
      pump();
    }

    button.addEventListener('click', () => {
      if (mode === 'enabled' || mode === 'loading') mute();
      else if (mode !== 'unsupported') void enable();
    });
    show();
    return { update, reset };
  };
})();
