import React, { useEffect, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

interface UnsavedChangesGuardProps {
  isDirty: boolean;
  onConfirmLeave: () => void;
  isOpen: boolean;
  onCancel: () => void;
  message?: string;
  title?: string;
}

export const UnsavedChangesGuard: React.FC<UnsavedChangesGuardProps> = ({
  isDirty,
  onConfirmLeave,
  isOpen,
  onCancel,
  message = 'You have unsaved changes. If you leave now, your draft modifications will be lost.',
  title = 'Discard Unsaved Changes?',
}) => {
  // Warn on window reload/close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  return (
    <ConfirmDialog
      isOpen={isOpen}
      onClose={onCancel}
      onConfirm={onConfirmLeave}
      title={title}
      description={message}
      confirmLabel="Discard Changes"
      cancelLabel="Continue Editing"
      variant="warning"
    />
  );
};
