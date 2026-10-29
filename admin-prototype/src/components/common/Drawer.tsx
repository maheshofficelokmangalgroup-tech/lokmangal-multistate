import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const widthClass = {
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in"
      />

      {/* Drawer Panel */}
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
        <div
          className={`w-screen ${widthClass} bg-surface shadow-2xl border-l border-border flex flex-col transform transition-transform ease-out duration-300 animate-in slide-in-from-right`}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-border flex items-start justify-between bg-canvas/40">
            <div>
              <h2 className="text-lg font-bold text-text-primary tracking-tight">{title}</h2>
              {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-control text-text-secondary hover:text-text-primary hover:bg-zinc-200/60 transition-colors"
              aria-label="Close panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">{children}</div>

          {/* Footer Actions */}
          {footer && (
            <div className="px-6 py-4 border-t border-border bg-canvas/40 flex items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
