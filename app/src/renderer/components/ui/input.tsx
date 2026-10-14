import type { ComponentProps, ReactElement } from 'react';
import { cn } from '@/lib/utils';

export function Input({
  className,
  ...props
}: ComponentProps<'input'>): ReactElement {
  return (
    <input
      data-slot="input"
      className={cn('clinic-input', className)}
      {...props}
    />
  );
}
