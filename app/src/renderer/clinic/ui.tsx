import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { ClinicError } from './contract';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/arc/badge/badge';
import { Skeleton } from '@/components/arc/skeleton/skeleton';

const iconPaths = {
  records:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4h5m-2.5-2.5v5M19 12h3m-3 4h3',
  flow: 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m3 11h3m-3 4h7',
  referrals: 'M4 7h15m-5-5 5 5-5 5M20 17H5m5-5-5 5 5 5',
  lab: 'M9 3h6m-5 0v7l-6 9a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2l-6-9V3M7 15h10',
  reports: 'M4 3v18h17M8 16v-4m5 4V8m5 8V5',
  audit:
    'M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4M9 2h6v4H9ZM7 11h10M7 16h6',
  search: 'M16 16l5 5M18 10.5a7.5 7.5 0 1 0-15 0 7.5 7.5 0 0 0 15 0',
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
} as const;

export function ClinicIcon({
  name,
}: {
  name: keyof typeof iconPaths;
}): ReactElement {
  return (
    <svg
      className="clinic-icon"
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

export function Confirm({
  title,
  children,
  action,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactElement {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return (): void => element?.close();
  }, []);
  return (
    <dialog
      className="confirm-dialog"
      ref={dialog}
      aria-labelledby="confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="confirm-title">{title}</h2>
      {children}
      <div className="form-actions">
        <Button variant="outline" onClick={onCancel} disabled={busy} autoFocus>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : action}
        </Button>
      </div>
    </dialog>
  );
}
export function ErrorNotice({
  error,
  children,
}: {
  error: ClinicError | null;
  children?: ReactNode;
}): ReactElement | null {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      <p>{error.message}</p>
      {children}
    </div>
  );
}
export function Field({
  label,
  name,
  error,
  errorName = name,
  hint,
  children,
}: {
  label: string;
  name: string;
  error?: ClinicError | null;
  errorName?: string;
  hint?: string;
  children: ReactNode;
}): ReactElement {
  const message = error?.fieldErrors?.[errorName];
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {Children.map(children, (child) => {
        if (
          !isValidElement<{
            id?: string;
            'aria-describedby'?: string;
            'aria-invalid'?: boolean;
          }>(child) ||
          child.props.id !== name
        )
          return child;
        const descriptions = new Set([
          ...(child.props['aria-describedby']?.split(' ') ?? []),
          ...(hint ? [`${name}-hint`] : []),
          ...(message ? [`${name}-error`] : []),
        ]);
        return cloneElement(child, {
          'aria-invalid': Boolean(message),
          'aria-describedby': [...descriptions].join(' ') || undefined,
        });
      })}
      {hint && (
        <p className="hint" id={`${name}-hint`}>
          {hint}
        </p>
      )}
      {message && (
        <p className="field-error" id={`${name}-error`} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
export function State({
  status,
}: {
  status: 'draft' | 'finalized' | 'preview' | 'issued';
}): ReactElement {
  return (
    <Badge
      tone={
        status === 'finalized' || status === 'issued' ? 'success' : 'warning'
      }
    >
      <span>
        {
          {
            draft: 'Draft',
            finalized: 'Finalized',
            preview: 'Draft document',
            issued: 'Issued',
          }[status]
        }
      </span>
    </Badge>
  );
}
export function Loading({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="loading-lines">
      <p>{children}</p>
      <Skeleton
        className="clinic-skeleton"
        label={
          typeof children === 'string' ? children : 'Loading clinic records'
        }
        lines={4}
      />
    </div>
  );
}
export function Empty({
  title,
  children,
  onRetry,
  action,
}: {
  title?: string;
  children: ReactNode;
  onRetry?: () => void;
  action?: ReactNode;
}): ReactElement {
  return (
    <EmptyState
      title={title}
      action={
        <>
          {action}
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
        </>
      }
    >
      {children}
    </EmptyState>
  );
}
