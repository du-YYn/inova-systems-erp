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
  success: { container: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  warning: { container: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-500'   },
  error:   { container: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500'     },
  info:    { container: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500'    },
  purple:  { container: 'bg-violet-50 text-violet-700 border-violet-200',    dot: 'bg-violet-500'  },
  gold:    { container: 'bg-[#A6864A]/10 text-[#A6864A] border-[#A6864A]/20', dot: 'bg-[#A6864A]' },
  neutral: { container: 'bg-gray-100 text-gray-600 border-gray-200',        dot: 'bg-gray-400'    },
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
