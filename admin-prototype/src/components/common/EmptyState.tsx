import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-full bg-canvas border border-border flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-text-secondary" />
      </div>
      <h3 className="text-sm font-bold text-text-primary">{title}</h3>
      {description && (
        <p className="text-xs text-text-secondary mt-1.5 max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};
