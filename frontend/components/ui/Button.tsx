'use client';

import { Loader2 } from 'lucide-react';
import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-accent-gold hover:bg-accent-gold-dark text-white border border-accent-gold shadow-sm',
  secondary:
    'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600',
  destructive:
    'bg-red-600 hover:bg-red-700 text-white border border-red-600 shadow-sm',
  ghost:
    'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 border border-transparent',
};

const sizeStyles: Record<Size, string> = {
  sm:  'px-3 py-1.5 text-xs gap-1.5 rounded-lg',
  md:  'px-4 py-2.5 text-sm gap-2 rounded-xl',
  lg:  'px-5 py-3 text-sm gap-2 rounded-xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      className = '',
      children,
      ...rest
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        aria-disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center font-medium',
          'transition-all duration-150 active:scale-[0.98]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/40',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          className,
        ].join(' ')}
        {...rest}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
