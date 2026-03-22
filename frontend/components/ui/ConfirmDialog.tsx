'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import FocusTrap from './FocusTrap';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  onConfirm,
  onCancel,
  danger = true,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <FocusTrap onClose={onCancel}>
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-modal animate-modal-in">
          <div className="flex items-start gap-4 mb-5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                danger ? 'bg-red-50 dark:bg-red-900/30' : 'bg-amber-50 dark:bg-amber-900/30'
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${danger ? 'text-red-600' : 'text-amber-600'}`}
              />
            </div>
            <div>
              <h3 id="confirm-dialog-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">{description}</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
            <Button variant={danger ? 'destructive' : 'primary'} size="sm" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </FocusTrap>
    </div>
  );
}
