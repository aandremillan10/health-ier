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
    <span
      className={`badge ${status === 'finalized' || status === 'issued' ? 'success' : 'warning'}`}
    >
      {
        {
          draft: 'Draft',
          finalized: 'Finalized',
          preview: 'Draft document',
          issued: 'Issued',
        }[status]
      }
    </span>
  );
}
export function Empty({
  children,
  onRetry,
}: {
  children: ReactNode;
  onRetry?: () => void;
}): ReactElement {
  return (
    <div className="empty">
      <p>{children}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
