import type { ComponentProps, ReactElement } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({
  className,
  ...props
}: ComponentProps<'textarea'>): ReactElement {
  return (
    <textarea
      data-slot="textarea"
      className={cn('clinic-input clinic-textarea', className)}
      {...props}
    />
  );
}
