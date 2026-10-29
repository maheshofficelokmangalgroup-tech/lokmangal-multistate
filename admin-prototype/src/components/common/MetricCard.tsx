import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: string;
  badgeVariant?: 'success' | 'warning' | 'neutral' | 'brand';
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  badge,
  badgeVariant = 'neutral',
  onClick,
}) => {
  const badgeColors = {
    brand: 'bg-brand-soft text-brand-primary border-brand/20',
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    neutral: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  };

  return (
    <div
      onClick={onClick}
      className={`bg-surface p-5 rounded-panel border border-border shadow-card transition-all ${
        onClick ? 'cursor-pointer hover:border-brand/40 hover:shadow-dropdown' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
          {title}
        </span>
        {Icon && (
          <div className="w-8 h-8 rounded-control bg-brand-soft text-brand-primary flex items-center justify-center">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-text-primary tabular-nums">
          {value}
        </span>
        {badge && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeColors[badgeVariant]}`}>
            {badge}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-xs text-text-secondary">{subtitle}</p>}
    </div>
  );
};
