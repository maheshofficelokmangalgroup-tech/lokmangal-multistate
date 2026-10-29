import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  actions,
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-border gap-4">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            {title}
          </h1>
          {badge}
        </div>
        {description && (
          <p className="mt-1 text-sm text-text-secondary max-w-3xl">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
};
