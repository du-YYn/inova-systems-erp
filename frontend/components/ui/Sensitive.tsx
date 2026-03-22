'use client';

import { useDemoMode } from './DemoContext';

interface SensitiveProps {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}

export function Sensitive({ children, as: Tag = 'span', className = '' }: SensitiveProps) {
  const { isDemoMode } = useDemoMode();

  if (!isDemoMode) {
    return <Tag className={className || undefined}>{children}</Tag>;
  }

  return (
    <Tag
      className={`sensitive-blur ${className}`.trim()}
      aria-hidden="true"
    >
      {children}
    </Tag>
  );
}
