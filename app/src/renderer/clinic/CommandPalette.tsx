import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import { SearchField } from '@/components/ui/search-field';
import type { ClinicApi, Patient, Principal } from './contract';
import { canEditRegistry, roleNames } from './contract';

// Quick patient search: opens with Ctrl+K from anywhere, picks with Enter.
// Reuses the registry's SearchField so the palette matches the main search
// bar; uses the same authorized findPatients call. No new API.
// The parent remounts this component via key, so closing resets all state.
export function CommandPalette({
  api,
  staff,
  open,
  onSelect,
  onRegister,
  onDismiss,
}: {
  api: ClinicApi;
  staff: Principal;
  open: boolean;
  onSelect: (patient: Patient) => void;
  onRegister: () => void;
  onDismiss: () => void;
}): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Patient[] | null>(null);
  const [resultsFor, setResultsFor] = useState('');
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [active, setActive] = useState(0);
  const requestId = useRef(0);
  const canRegister = canEditRegistry(staff);

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  useEffect((): (() => void) | undefined => {
    const text = query.trim();
    if (!text) return undefined;
    const request = ++requestId.current;
    const timer = window.setTimeout((): void => {
      setSearching(true);
      void api
        .findPatients({ search: text })
        .then((result) => {
          if (request !== requestId.current) return;
          setSearching(false);
          setResultsFor(text);
          if (result.ok) {
            setResults(result.data);
            setActive(0);
            setMessage('');
          } else {
            setResults([]);
            setMessage(result.error.message);
          }
        })
        .catch(() => {
          if (request !== requestId.current) return;
          setSearching(false);
          setResults([]);
          setResultsFor(text);
          setMessage('Search is unavailable. Check the clinic connection.');
        });
    }, 250);
    return (): void => window.clearTimeout(timer);
  }, [api, query]);

  const trimmed = query.trim();
  const stale = resultsFor !== trimmed;
  const items = stale ? [] : (results ?? []);
  const showList = !stale && !message && (canRegister || items.length > 0);
  const optionCount = items.length + (showList && canRegister ? 1 : 0);

  function choose(index: number): void {
    if (index < items.length) {
      dialog.current?.close();
      onSelect(items[index]);
    } else if (canRegister) {
      dialog.current?.close();
      onRegister();
    }
  }
  function move(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (optionCount > 0) setActive((current) => (current + 1) % optionCount);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (optionCount > 0)
        setActive((current) => (current - 1 + optionCount) % optionCount);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (!stale && optionCount > 0) choose(active);
      else if (!stale && canRegister) choose(items.length);
    }
  }

  return (
    <dialog
      className="command-dialog"
      ref={dialog}
      aria-label="Quick patient search"
      onCancel={(event) => {
        event.preventDefault();
        dialog.current?.close();
        onDismiss();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          dialog.current?.close();
          onDismiss();
        }
      }}
    >
      <div className="command-search">
        <SearchField
          value={query}
          onValueChange={setQuery}
          onKeyDown={move}
          escapeBehavior="propagate"
          aria-label="Search patient name"
          aria-controls="command-results"
          aria-activedescendant={
            optionCount > 0 ? `command-option-${active}` : undefined
          }
          placeholder="Search patient name"
          autoComplete="off"
          autoFocus
        />
      </div>
      {stale && trimmed !== '' ? (
        <p className="command-empty" role="status">
          Searching…
        </p>
      ) : stale ? null : message ? (
        <p className="command-empty" role="alert">
          {message}
        </p>
      ) : trimmed === '' ? (
        <p className="command-empty">
          Type a patient name, or choose Register patient below.
        </p>
      ) : searching ? (
        <p className="command-empty" role="status">
          Searching…
        </p>
      ) : !showList ? (
        <p className="command-empty">
          No matching patient. Try a shorter name.
        </p>
      ) : null}
      {showList && (
        <ul className="command-results" id="command-results">
          {items.map((patient, index) => (
            <li key={patient.id}>
              <button
                type="button"
                id={`command-option-${index}`}
                className="command-option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <strong>{patient.fullName}</strong>
                <span className="muted">{patient.id}</span>
              </button>
            </li>
          ))}
          {canRegister && (
            <li>
              <button
                type="button"
                id={`command-option-${items.length}`}
                className="command-option"
                aria-selected={active === items.length}
                onMouseEnter={() => setActive(items.length)}
                onClick={() => choose(items.length)}
              >
                <strong>Register patient</strong>
                <span className="muted">{roleNames[staff.role]} only</span>
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="command-hint">
        <span>
          <kbd className="kbd">Enter</kbd> opens
        </span>
        <span>
          <kbd className="kbd">Esc</kbd> closes
        </span>
      </div>
    </dialog>
  );
}
