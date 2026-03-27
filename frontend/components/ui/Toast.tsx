'use client';

import { createContext, useCallback, useContext, useState, useRef } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((type: ToastType, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => dismiss(id), 3800);
  }, [dismiss]);

  const success = useCallback((message: string) => toast('success', message), [toast]);
  const error   = useCallback((message: string) => toast('error', message),   [toast]);
  const warning = useCallback((message: string) => toast('warning', message), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none">
        <AnimatePresence initial={false} mode="sync">
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const styles: Record<ToastType, { bar: string; tint: string; icon: React.ReactNode }> = {
    success: {
      bar:  'bg-emerald-500',
      tint: 'bg-white dark:bg-gray-800 border-emerald-200 dark:border-emerald-800/40',
      icon: <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />,
    },
    error: {
      bar:  'bg-red-500',
      tint: 'bg-white dark:bg-gray-800 border-red-200 dark:border-red-800/40',
      icon: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
    },
    warning: {
      bar:  'bg-amber-400',
      tint: 'bg-white dark:bg-gray-800 border-amber-200 dark:border-amber-700/40',
      icon: <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
    },
  };

  const { bar, tint, icon } = styles[toast.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 48, scale: 0.94 }}
      animate={{ opacity: 1, x: 0,  scale: 1    }}
      exit={{    opacity: 0, x: 48,  scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      role="alert"
      aria-live="assertive"
      className="pointer-events-auto"
      onMouseEnter={() => clearTimeout(timerRef.current)}
      onMouseLeave={() => {
        timerRef.current = setTimeout(() => onDismiss(toast.id), 1500);
      }}
    >
      <div className={`${tint} border rounded-xl shadow-card overflow-hidden`}>
        {/* Progress bar */}
        <motion.div
          className={`h-0.5 ${bar}`}
          initial={{ width: '100%' }}
          animate={{ width: '0%' }}
          transition={{ duration: 3.8, ease: 'linear' }}
        />
        <div className="flex items-start gap-3 px-4 py-3">
          {icon}
          <p className="text-sm text-gray-700 dark:text-gray-200 flex-1 leading-snug">{toast.message}</p>
          <button
            onClick={() => onDismiss(toast.id)}
            className="p-0.5 hover:bg-black/5 dark:hover:bg-white/10 rounded transition-colors flex-shrink-0 mt-0.5"
            aria-label="Fechar notificação"
          >
            <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
