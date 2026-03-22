'use client';

type Variant = 'success' | 'warning' | 'error' | 'info' | 'purple' | 'gold' | 'neutral';
type Size = 'sm' | 'md';

interface BadgeProps {
  variant?: Variant;
  size?: Size;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<Variant, { container: string; dot: string }> = {
  success: { container: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
  warning: { container: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800', dot: 'bg-amber-500' },
  error:   { container: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800', dot: 'bg-red-500' },
  info:    { container: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800', dot: 'bg-blue-500' },
  purple:  { container: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800', dot: 'bg-violet-500' },
  gold:    { container: 'bg-accent-gold/10 text-accent-gold border-accent-gold/20', dot: 'bg-accent-gold' },
  neutral: { container: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600', dot: 'bg-gray-400' },
};

const sizeStyles: Record<Size, string> = {
  sm: 'px-2 py-0.5 text-xs gap-1.5',
  md: 'px-2.5 py-1 text-xs gap-2',
};

export function Badge({ variant = 'neutral', size = 'sm', dot = false, children, className = '' }: BadgeProps) {
  const { container, dot: dotColor } = variantStyles[variant];
  return (
    <span
      className={[
        'inline-flex items-center font-medium border rounded-full',
        container,
        sizeStyles[size],
        className,
      ].join(' ')}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />}
      {children}
    </span>
  );
}
