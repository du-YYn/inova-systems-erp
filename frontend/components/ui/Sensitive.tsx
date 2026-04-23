'use client';

import { useDemoMode } from './DemoContext';

interface SensitiveProps {
  children: React.ReactNode;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}

/** Comprimento do placeholder em demo mode — proporcional ao conteúdo original,
 * limitado entre 4 e 24 bullets para não explodir o layout. */
function placeholderFor(children: React.ReactNode): string {
  const text = typeof children === 'string' || typeof children === 'number'
    ? String(children)
    : '';
  const len = Math.max(4, Math.min(text.length || 8, 24));
  return '•'.repeat(len);
}

export function Sensitive({ children, as: Tag = 'span', className = '' }: SensitiveProps) {
  const { isDemoMode } = useDemoMode();

  if (!isDemoMode) {
    return <Tag className={className || undefined}>{children}</Tag>;
  }

  // Em demo mode, renderiza placeholder em vez de aplicar CSS blur.
  // Blur é trivialmente removível via DevTools (element.classList.remove)
  // expondo os dados reais; placeholder nunca coloca o dado no DOM.
  return (
    <Tag
      className={`text-gray-400 dark:text-gray-500 ${className}`.trim()}
      aria-label="Dado oculto em modo demo"
      title="Dado oculto em modo demo"
    >
      {placeholderFor(children)}
    </Tag>
  );
}
