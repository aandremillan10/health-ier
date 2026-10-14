import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import { SearchField } from '@/components/ui/search-field';
import type { ClinicApi, Patient, Principal } from './contract';
import { canEditRegistry, roleNames } from './contract';
import { date } from './format';

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
  restoreFocus,
}: {
  api: ClinicApi;
  staff: Principal;
  open: boolean;
  onSelect: (patient: Patient) => void;
  onRegister: () => void;
  onDismiss: () => void;
  restoreFocus: () => void;
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
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    return (): void => {
      element?.close();
      restoreFocus();
    };
  }, [open, restoreFocus]);

  useEffect((): (() => void) | undefined => {
    const text = query.trim();
    const request = ++requestId.current;
    if (!text) return undefined;
    let active = true;
    const timer = window.setTimeout((): void => {
      setSearching(true);
      void api
        .findPatients({ search: text })
        .then((result) => {
          if (!active || request !== requestId.current) return;
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
          if (!active || request !== requestId.current) return;
          setSearching(false);
          setResults([]);
          setResultsFor(text);
          setMessage('Search is unavailable. Check the clinic connection.');
        });
    }, 250);
    return (): void => {
      window.clearTimeout(timer);
      active = false;
    };
  }, [api, query]);

  const trimmed = query.trim();
  const stale = resultsFor !== trimmed;
  const items = stale ? [] : (results ?? []);
  const showList = !stale && !message && (canRegister || items.length > 0);
  const optionCount = items.length + (showList && canRegister ? 1 : 0);
  useEffect(() => {
    if (optionCount > 0)
      document
        .getElementById(`command-option-${active}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [active, optionCount]);

  function choose(index: number): void {
    if (index >= 0 && index < items.length) {
      dialog.current?.close();
      onSelect(items[index]);
    } else if (showList && canRegister && index === items.length) {
      dialog.current?.close();
      onRegister();
    }
  }
  function move(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      dialog.current?.close();
      onDismiss();
    } else if (event.key === 'ArrowDown') {
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
          onValueChange={(value) => {
            requestId.current++;
            setQuery(value);
            setActive(0);
            setResults(null);
            setMessage('');
            setSearching(false);
            setResultsFor('');
          }}
          onKeyDown={move}
          escapeBehavior="propagate"
          role="combobox"
          aria-label="Search patient name or number"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls="command-results"
          aria-activedescendant={
            optionCount > 0 ? `command-option-${active}` : undefined
          }
          placeholder="Patient name or number"
          autoComplete="off"
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
          {canRegister
            ? 'Type a patient name or number, or choose Register patient below.'
            : 'Type a patient name or number. Compare the identity details before opening a record.'}
        </p>
      ) : searching ? (
        <p className="command-empty" role="status">
          Searching…
        </p>
      ) : !showList ? (
        <p className="command-empty" role="status">
          No matching patient. Try a shorter name.
        </p>
      ) : null}
      {showList && (
        <ul
          className="command-results"
          id="command-results"
          role="listbox"
          aria-label="Patient results and actions"
        >
          {items.map((patient, index) => (
            <li key={patient.id} role="presentation">
              <button
                type="button"
                role="option"
                tabIndex={-1}
                id={`command-option-${index}`}
                className="command-option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span className="command-identity">
                  <strong>{patient.fullName}</strong>
                  {'dateOfBirth' in patient && (
                    <span className="hint">
                      Birth date: {date(patient.dateOfBirth)}
                    </span>
                  )}
                </span>
                <span className="hint command-number">{patient.id}</span>
              </button>
            </li>
          ))}
          {canRegister && (
            <li role="presentation">
              <button
                type="button"
                role="option"
                tabIndex={-1}
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
      {trimmed && !stale && !message && !searching && (
        <p className="sr-only" role="status">
          {items.length} patient records found. Use arrow keys to compare
          results, then Enter to open.
        </p>
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
