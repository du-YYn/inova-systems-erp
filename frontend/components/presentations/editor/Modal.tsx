'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, onClose, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[color:var(--pr-bg-elevated)] rounded-xl border border-[color:var(--pr-border)] w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[color:var(--pr-border)]">
          <h2 className="text-base font-medium">{title}</h2>
          <button
            onClick={onClose}
            className="text-[color:var(--pr-text-tertiary)] hover:text-[color:var(--pr-text-primary)] transition-colors"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-[color:var(--pr-border)] flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
