import type { ReactElement, ReactNode } from 'react';

// Adapted from UIArc's MIT empty state; clinic tasks use immediate, static feedback.
// https://uiarc.dev/r/empty-state.json
export function EmptyState({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}): ReactElement {
  return (
    <div className="empty">
      {title && <h2>{title}</h2>}
      <p>{children}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
