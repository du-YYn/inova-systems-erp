'use client';

import { clsx } from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

const variants: Record<Variant, string> = {
  primary:
    'bg-[color:var(--pr-gold)] text-[color:var(--pr-bg)] hover:bg-[color:var(--pr-gold-soft)] font-medium',
  ghost:
    'bg-transparent text-[color:var(--pr-text-secondary)] border border-[color:var(--pr-border)] hover:bg-[color:var(--pr-bg-elevated)] hover:text-[color:var(--pr-text-primary)]',
  danger:
    'bg-transparent text-[color:var(--pr-text-secondary)] border border-[color:var(--pr-border)] hover:border-red-500/60 hover:text-red-400',
};

export function PButton({
  variant = 'primary', className, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant], className,
      )}
    >
      {children}
    </button>
  );
}
