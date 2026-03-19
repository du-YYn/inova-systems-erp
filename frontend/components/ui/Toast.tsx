'use client';

import { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';

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
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const success = useCallback((message: string) => toast('success', message), [toast]);
  const error = useCallback((message: string) => toast('error', message), [toast]);
  const warning = useCallback((message: string) => toast('warning', message), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-80">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const styles: Record<ToastType, { bg: string; icon: React.ReactNode }> = {
    success: {
      bg: 'bg-white border-l-4 border-green-500',
      icon: <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />,
    },
    error: {
      bg: 'bg-white border-l-4 border-red-500',
      icon: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
    },
    warning: {
      bg: 'bg-white border-l-4 border-yellow-500',
      icon: <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />,
    },
  };

  const { bg, icon } = styles[toast.type];

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`${bg} rounded-lg shadow-lg p-4 flex items-start gap-3 transition-all duration-300 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
      }`}
    >
      {icon}
      <p className="text-sm text-gray-700 flex-1">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-0.5 hover:bg-gray-100 rounded flex-shrink-0"
      >
        <X className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
