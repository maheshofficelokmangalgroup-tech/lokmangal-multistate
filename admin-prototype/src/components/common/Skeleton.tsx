import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => {
  return (
    <div
      className={`animate-pulse bg-zinc-200/70 rounded-control ${className}`}
    />
  );
};

/** A pre-built skeleton matching the PageHeader + table pattern */
export const TableSkeleton: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-32 rounded-control" />
      </div>
      {/* Table skeleton */}
      <div className="bg-surface border border-border rounded-panel p-5 space-y-4">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
};

/** A pre-built skeleton matching form editors */
export const FormSkeleton: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-6 border-b border-border">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-control" />
      </div>
      <div className="bg-surface border border-border rounded-panel p-6 space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
};
