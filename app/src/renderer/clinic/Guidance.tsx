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
  const [conflictArmed, setConflictArmed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = useRef(index);
  const armed = useRef(false);
  const target = useRef<HTMLElement | null>(null);
  const originalDetails = useRef<string | null>(null);
  const markerElement = useRef<HTMLSpanElement>(null);
  const step = session.steps[index];
  const done = completed.has(index);
  const finish = (): void =>
    setCompleted((previous) => new Set(previous).add(current.current));
  useLayoutEffect(() => {
    current.current = index;
    armed.current = false;
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
    let frame = 0;
    function measure(): void {
      const next = findPracticeTarget(container!, step);
      if (target.current !== next) {
        target.current?.classList.remove('practice-target');
        if (originalDetails.current === null)
          target.current?.removeAttribute('aria-details');
        else
          target.current?.setAttribute('aria-details', originalDetails.current);
        target.current = next;
        originalDetails.current = next?.getAttribute('aria-details') ?? null;
        next?.classList.add('practice-target');
        next?.setAttribute('aria-details', 'practice-step-description');
      }
      setMissing(!next);
      if (next) {
        const rect = next.getBoundingClientRect();
        const size = markerElement.current?.getBoundingClientRect();
        const width = size?.width ?? 0;
        const height = size?.height ?? 0;
        const top =
          rect.top >= height + 16 ? rect.top - height - 8 : rect.bottom + 8;
        // If neither side fits, retain the outline instead of covering the control.
        setMarker(
          rect.bottom > 0 &&
            rect.top < innerHeight &&
            top + height <= innerHeight - 8
            ? {
                left: Math.max(8, Math.min(innerWidth - width - 8, rect.left)),
                top,
              }
            : null,
        );
      } else setMarker(null);
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const resize = new ResizeObserver(schedule);
    const mutation = new MutationObserver(schedule);
    resize.observe(container);
    if (markerElement.current) resize.observe(markerElement.current);
    mutation.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'disabled'],
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
      <aside className="practice-guide" aria-label="Practice guide">
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
        <div className="practice-step-actions">
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
        <p className="hint">
          Back reviews instructions; completed actions remain in this practice.
          Escape exits. Nothing here is saved to the clinic server.
        </p>
        <Button variant="ghost" onClick={onRestart}>
          Restart practice
        </Button>
      </aside>
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
