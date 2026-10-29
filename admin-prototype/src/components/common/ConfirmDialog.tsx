import React, { useEffect } from 'react';
import { AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  isLoading = false,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const btnStyles = {
    danger: 'bg-status-destructive hover:bg-red-800 text-white',
    warning: 'bg-status-warning hover:bg-amber-800 text-white',
    primary: 'bg-brand-primary hover:bg-brand-hover text-white',
  }[variant];

  const Icon = variant === 'danger' ? AlertCircle : variant === 'warning' ? AlertTriangle : HelpCircle;
  const iconColor =
    variant === 'danger'
      ? 'text-status-destructive bg-red-50'
      : variant === 'warning'
      ? 'text-status-warning bg-amber-50'
      : 'text-brand-primary bg-brand-soft';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div onClick={onClose} className="fixed inset-0 bg-black/40 backdrop-blur-xs animate-in fade-in" />

        <div className="relative w-full max-w-md transform overflow-hidden rounded-panel bg-surface p-6 text-left shadow-2xl border border-border transition-all animate-in zoom-in-95">
          <div className="flex items-start gap-4">
            <div className={`p-2.5 rounded-full ${iconColor} flex-shrink-0`}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-text-primary">{title}</h3>
              <p className="mt-2 text-sm text-text-secondary leading-relaxed">{description}</p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium rounded-control border border-border bg-surface text-text-secondary hover:bg-canvas transition-colors disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 text-sm font-semibold rounded-control transition-colors shadow-subtle disabled:opacity-50 ${btnStyles}`}
            >
              {isLoading ? 'Processing...' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
