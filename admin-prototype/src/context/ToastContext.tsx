import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextType {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: Toast = { ...toast, id };
      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        removeToast(id);
      }, 5000);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start p-3.5 rounded-control shadow-dropdown border transition-all animate-in slide-in-from-bottom-2 ${
              toast.type === 'success'
                ? 'bg-white border-green-200 text-green-900'
                : toast.type === 'error'
                ? 'bg-white border-red-200 text-red-900'
                : toast.type === 'warning'
                ? 'bg-white border-amber-200 text-amber-900'
                : 'bg-white border-blue-200 text-blue-900'
            }`}
          >
            <div className="flex-shrink-0 mt-0.5 mr-2.5">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-status-success" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-status-destructive" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-status-warning" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-blue-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.message && <p className="text-xs text-text-secondary mt-0.5">{toast.message}</p>}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="flex-shrink-0 ml-2 text-text-secondary hover:text-text-primary p-1 rounded-sm"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};
