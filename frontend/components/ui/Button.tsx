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
    'bg-[#A6864A] hover:bg-[#8B6F3D] text-white border border-[#A6864A] shadow-sm',
  secondary:
    'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
  destructive:
    'bg-red-600 hover:bg-red-700 text-white border border-red-600 shadow-sm',
  ghost:
    'bg-transparent hover:bg-gray-100 text-gray-600 border border-transparent',
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
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A6864A]/40',
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
