import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement, RefObject } from 'react';
import { Button } from '@/components/ui/button';
import type { Principal } from './contract';
import { availableTopics, topicHelp, topicNames } from './practice';
import type { PracticeSession, PracticeStep, PracticeTopic } from './practice';
import './guidance.css';

export function ContextHelp({
  topic,
  staff,
  onPractice,
  pending = false,
}: {
  topic: PracticeTopic;
  staff: Principal;
  onPractice: (topic: PracticeTopic) => void;
  pending?: boolean;
}): ReactElement {
  const topics = availableTopics(staff);
  return (
    <aside className="context-help" aria-label="Help for this task">
      <p>{topicHelp[topic]}</p>
      <details>
        <summary>How to use</summary>
        <p>
          Use Patients for the registry, Clinic work for appointments,
          referrals, and laboratory orders, and Review for reports and the audit
          trail. Some destinations depend on your role.
        </p>
        <ul className="navigation-help">
          <li>
            <strong>Find a patient:</strong> select Search patients or press
            Ctrl+K from any screen. Select Patient records to return to the
            registry.
          </li>
          <li>
            <strong>Move within a record:</strong> when a patient is open, use
            Record sections below the patient identity. Select the patient name
            in the breadcrumb to return to Patient details.
          </li>
          <li>
            <strong>Open clinic work:</strong> use the Clinic work group. If a
            task has a selected patient, use View work queue when it appears to
            clear that patient context.
          </li>
          <li>
            <strong>Review clinic activity:</strong> open Reports in Review and
            apply a date range. Patient counts by recorded sex count each
            patient once; missing or unknown values appear as Not recorded.
          </li>
          <li>
            <strong>Review consultations:</strong> open a patient’s Medical
            chart. Select a row in Consultation history to open its full note;
            entries are newest first.
          </li>
          <li>
            <strong>On a narrow window:</strong> select Menu to open clinic
            navigation.
          </li>
        </ul>
        <p>
          Work with the selected patient and your own named account. Read the
          result after each save. If a save fails, keep your input and use the
          visible recovery action.
        </p>
        <p>
          Practice uses fictional records and starts fresh each time. You can
          exit at any step and return to your current work.
        </p>
        {topics.includes(topic) && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => onPractice(topic)}
          >
            Practice this task
          </Button>
        )}
        <label className="field" htmlFor="practice-topic">
          Practice guides
        </label>
        <select
          id="practice-topic"
          className="clinic-select"
          defaultValue=""
          disabled={pending}
          onChange={(event) => {
            const selected = topics.find((item) => item === event.target.value);
            if (selected) onPractice(selected);
            event.target.value = '';
          }}
        >
          <option value="">Choose a guide…</option>
          {topics.map((item) => (
            <option key={item} value={item}>
              {topicNames[item]}
            </option>
          ))}
        </select>
        {pending && <p role="status">Preparing fictional practice records…</p>}
      </details>
    </aside>
  );
}

function findPracticeTarget(
  root: HTMLElement,
  step: PracticeStep,
): HTMLElement | null {
  const candidates = [...root.querySelectorAll<HTMLElement>(step.target)];
  return (
    candidates.find(
      (element) =>
        element.getClientRects().length > 0 &&
        (!step.match ||
          (element.getAttribute('aria-label') ?? element.textContent ?? '')
            .trim()
            .includes(step.match)),
    ) ?? null
  );
}

export function PracticeGuide({
  session,
  root,
  onExit,
  onRestart,
}: {
  session: PracticeSession;
  root: RefObject<HTMLDivElement | null>;
  onExit: () => void;
  onRestart: () => void;
}): ReactElement {
  const [index, setIndex] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(() => new Set());
  const [missing, setMissing] = useState(false);
  const [marker, setMarker] = useState<{ left: number; top: number } | null>(
    null,
  );
  const [spotlight, setSpotlight] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    hole: { left: number; top: number; width: number; height: number };
  } | null>(null);
  const [conflictArmed, setConflictArmed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = useRef(index);
  const armed = useRef(false);
  const target = useRef<HTMLElement | null>(null);
  const originalDetails = useRef<string | null>(null);
  const markerElement = useRef<HTMLSpanElement>(null);
  const guide = useRef<HTMLElement>(null);
  const step = session.steps[index];
  const done = completed.has(index);
  const finish = (): void =>
    setCompleted((previous) => new Set(previous).add(current.current));
  useLayoutEffect(() => {
    current.current = index;
    armed.current = false;
    if (heading.current?.parentElement)
      heading.current.parentElement.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
  }, [index]);
  useEffect(
    () =>
      session.subscribe((event) => {
        const action = session.steps[current.current]?.action;
        if (
          armed.current &&
          action &&
          'method' in action &&
          event.method === action.method &&
          event.ok === (action.ok ?? true)
        )
          finish();
      }),
    [session],
  );
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    function interact(event: Event): void {
      if (
        !(event.target instanceof Element) ||
        event.target.closest('.practice-guide')
      )
        return;
      armed.current = true;
      const activeStep = session.steps[current.current];
      if (
        activeStep?.action &&
        'click' in activeStep.action &&
        event.type === 'click'
      ) {
        const expected = findPracticeTarget(container!, activeStep);
        if (
          expected &&
          (expected === event.target || expected.contains(event.target))
        )
          finish();
      }
    }
    container.addEventListener('click', interact, true);
    container.addEventListener('input', interact, true);
    container.addEventListener('change', interact, true);
    return (): void => {
      container.removeEventListener('click', interact, true);
      container.removeEventListener('input', interact, true);
      container.removeEventListener('change', interact, true);
    };
  }, [root, session]);
  useEffect(() => {
    function escape(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        onExit();
      }
    }
    window.addEventListener('keydown', escape, true);
    return (): void => window.removeEventListener('keydown', escape, true);
  }, [onExit]);
  useEffect(() => {
    const container = root.current;
    if (!container || !step) return;
    const screen = container.querySelector<HTMLElement>('.practice-screen');
    if (!screen) return;
    let frame = 0;
    function measure(): void {
      const next = findPracticeTarget(container!, step);
      if (target.current !== next) {
        if (target.current) resize.unobserve(target.current);
        target.current?.classList.remove('practice-target');
        if (originalDetails.current === null)
          target.current?.removeAttribute('aria-details');
        else
          target.current?.setAttribute('aria-details', originalDetails.current);
        target.current = next;
        originalDetails.current = next?.getAttribute('aria-details') ?? null;
        next?.classList.add('practice-target');
        next?.setAttribute('aria-details', 'practice-step-description');
        if (next) resize.observe(next);
      }
      setMissing(!next);
      if (next) {
        const rect = (
          next.closest('.search-field') ?? next
        ).getBoundingClientRect();
        const viewport = screen!.getBoundingClientRect();
        const visible =
          rect.bottom > viewport.top &&
          rect.top < viewport.bottom &&
          rect.right > viewport.left &&
          rect.left < viewport.right;
        // Clip the hole and scrim to the scrolling task region. Top-layer
        // dialogs retain their own native stacking and pointer behavior.
        setSpotlight(
          visible
            ? {
                left: viewport.left,
                top: viewport.top,
                width: viewport.width,
                height: viewport.height,
                hole: {
                  left: rect.left - viewport.left - 8,
                  top: rect.top - viewport.top - 8,
                  width: rect.width + 16,
                  height: rect.height + 16,
                },
              }
            : null,
        );
        const size = markerElement.current?.getBoundingClientRect();
        const width = size?.width ?? 0;
        const height = size?.height ?? 0;
        const top =
          rect.top >= viewport.top + height + 16
            ? rect.top - height - 8
            : rect.bottom + 8;
        const label =
          next instanceof HTMLInputElement ||
          next instanceof HTMLTextAreaElement ||
          next instanceof HTMLSelectElement
            ? next.labels?.[0]
            : null;
        const labelText = document.createRange();
        if (label) labelText.selectNodeContents(label);
        const labelBounds = label ? labelText.getBoundingClientRect() : null;
        const rightAligned = Math.max(
          viewport.left + 8,
          Math.min(viewport.right - width - 8, rect.right - width),
        );
        const left =
          labelBounds &&
          top < labelBounds.bottom &&
          top + height > labelBounds.top &&
          rightAligned < labelBounds.right &&
          rightAligned + width > labelBounds.left
            ? labelBounds.right + 8
            : rightAligned;
        // If neither side fits, retain the outline instead of covering the control.
        setMarker(
          visible &&
            top + height <= viewport.bottom - 8 &&
            left + width <= viewport.right - 8
            ? {
                left,
                top,
              }
            : null,
        );
      } else {
        setMarker(null);
        setSpotlight(null);
      }
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    const mutation = new MutationObserver(schedule);
    resize.observe(container);
    resize.observe(screen);
    if (guide.current) resize.observe(guide.current);
    if (markerElement.current) resize.observe(markerElement.current);
    mutation.observe(screen, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'disabled', 'style', 'class'],
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    schedule();
    return (): void => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      target.current?.classList.remove('practice-target');
      if (originalDetails.current === null)
        target.current?.removeAttribute('aria-details');
      else
        target.current?.setAttribute('aria-details', originalDetails.current);
      target.current = null;
    };
  }, [root, step]);
  if (!step) return <></>;
  return (
    <>
      <aside ref={guide} className="practice-guide" aria-label="Practice guide">
        <div className="practice-guide-header">
          <div className="practice-guide-top">
            <strong>{topicNames[session.topic]}</strong>
            <Button variant="outline" onClick={onExit}>
              Exit practice
            </Button>
          </div>
          <p role="status" aria-live="polite">
            Step {index + 1} of {session.steps.length}
            {done ? ' · Action completed' : ''}
          </p>
        </div>
        <div className="practice-guide-content">
          <h2 ref={heading} tabIndex={-1}>
            {step.title}
          </h2>
          <p id="practice-step-description">{step.text}</p>
          {missing && !done && (
            <p className="notice warning" role="status">
              This control is not on the current screen. Return to the relevant
              screen or restart this practice. The guide has not advanced.
            </p>
          )}
          {session.topic === 'medical' && index === 3 && !conflictArmed && (
            <Button
              variant="outline"
              onClick={() => {
                session.conflictNext();
                setConflictArmed(true);
              }}
            >
              Simulate revision conflict
            </Button>
          )}
          {step.action && !done && (
            <p className="hint">
              Complete the action in the practice screen to continue.
            </p>
          )}
          <p className="hint">
            Back reviews instructions; completed actions remain in this
            practice. Escape exits. Nothing here is saved to the clinic server.
          </p>
          <Button variant="ghost" onClick={onRestart}>
            Restart practice
          </Button>
        </div>
        <div className="practice-step-actions">
          {!missing && (
            <Button
              variant="outline"
              onClick={() => {
                target.current?.scrollIntoView({
                  block: 'center',
                  behavior: 'instant',
                });
                target.current?.focus({ preventScroll: true });
              }}
            >
              Show this control
            </Button>
          )}
          <Button
            variant="outline"
            disabled={index === 0}
            onClick={() => setIndex((value) => value - 1)}
          >
            Back
          </Button>
          {index === session.steps.length - 1 ? (
            <Button disabled={Boolean(step.action) && !done} onClick={onExit}>
              Finish practice
            </Button>
          ) : (
            <Button
              disabled={(Boolean(step.action) && !done) || (missing && !done)}
              onClick={() => setIndex((value) => value + 1)}
            >
              Next
            </Button>
          )}
        </div>
      </aside>
      {spotlight && (
        <div
          className="practice-spotlight"
          aria-hidden="true"
          style={{
            left: spotlight.left,
            top: spotlight.top,
            width: spotlight.width,
            height: spotlight.height,
          }}
        >
          <div className="practice-spotlight-hole" style={spotlight.hole} />
        </div>
      )}
      <span
        ref={markerElement}
        className="practice-marker"
        aria-hidden="true"
        style={{
          ...(marker ?? { left: 0, top: 0 }),
          visibility: marker && !done ? 'visible' : 'hidden',
        }}
      >
        Step {index + 1}
      </span>
    </>
  );
}
