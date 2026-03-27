'use client';

import { Check, Loader2 } from 'lucide-react';
import { ButtonHTMLAttributes, forwardRef, useState } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  /** Auto shows a checkmark for 1.4s after onClick (for save actions) */
  successFeedback?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-accent-gold hover:bg-accent-gold-dark active:bg-accent-gold-dark text-white border border-accent-gold/80 shadow-sm hover:shadow-glow-gold',
  secondary:
    'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:border-gray-300',
  destructive:
    'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white border border-red-600 shadow-sm',
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
      successFeedback = false,
      disabled,
      className = '',
      children,
      onClick,
      ...rest
    },
    ref,
  ) => {
    const [showSuccess, setShowSuccess] = useState(false);
    const isDisabled = disabled || loading || showSuccess;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (successFeedback && onClick) {
        onClick(e);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 1400);
      } else if (onClick) {
        onClick(e);
      }
    };

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-busy={loading}
        aria-disabled={isDisabled}
        onClick={handleClick}
        className={[
          'inline-flex items-center justify-center font-medium',
          'transition-all duration-150 active:scale-[0.97] hover:-translate-y-px',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/40',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
          variantStyles[variant],
          sizeStyles[size],
          showSuccess ? '!bg-emerald-600 !border-emerald-600 !text-white' : '',
          className,
        ].join(' ')}
        {...rest}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : showSuccess ? (
          <Check className="w-4 h-4 animate-check" />
        ) : null}
        {!showSuccess && children}
        {showSuccess && (
          <span className="animate-check">Salvo!</span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';
