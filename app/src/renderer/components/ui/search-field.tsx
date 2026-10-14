import { useRef } from 'react';
import type { InputHTMLAttributes, ReactElement } from 'react';

// Adapted from UIArc's MIT search field: reserved clear slot and focus restoration.
// https://uiarc.dev/r/search-field.json — routine typing and clearing stay immediate.
export function SearchField({
  value,
  onValueChange,
  ...props
}: Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  value: string;
  onValueChange: (value: string) => void;
}): ReactElement {
  const input = useRef<HTMLInputElement>(null);
  function clear(): void {
    onValueChange('');
    input.current?.focus();
  }
  return (
    <div className="search-field">
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
      <input
        {...props}
        ref={input}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.key === 'Escape' && value) {
            event.preventDefault();
            clear();
          }
        }}
      />
      <span className="search-clear-slot">
        {value && (
          <button
            type="button"
            disabled={props.disabled}
            aria-label="Clear search"
            onClick={clear}
          >
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </span>
    </div>
  );
}
