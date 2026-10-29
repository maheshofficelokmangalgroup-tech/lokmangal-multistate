import React from 'react';
import { ArrowRight, Plus, Minus, Edit2 } from 'lucide-react';

export interface DiffField {
  field: string;
  label?: string;
  oldValue: string | number | null | undefined;
  newValue: string | number | null | undefined;
  type?: 'text' | 'number' | 'percentage' | 'currency' | 'status';
}

interface FieldDiffProps {
  changes: DiffField[];
  className?: string;
  compact?: boolean;
}

export const FieldDiff: React.FC<FieldDiffProps> = ({
  changes,
  className = '',
  compact = false,
}) => {
  if (changes.length === 0) {
    return (
      <div className="p-4 rounded-control bg-canvas text-xs text-text-secondary text-center">
        No modifications detected between these versions.
      </div>
    );
  }

  const formatVal = (val: string | number | null | undefined, type?: string) => {
    if (val === null || val === undefined || val === '') return <span className="text-zinc-400 italic">None</span>;
    if (type === 'percentage') return `${val}%`;
    if (type === 'currency') return `₹${Number(val).toLocaleString('en-IN')}`;
    return String(val);
  };

  return (
    <div className={`border border-border rounded-control overflow-hidden bg-surface ${className}`}>
      <table className="w-full text-left text-xs">
        <thead className="bg-canvas border-b border-border font-semibold text-text-secondary uppercase tracking-wider">
          <tr>
            <th className="px-3.5 py-2.5">Field</th>
            <th className="px-3.5 py-2.5">Previous Value</th>
            <th className="px-3.5 py-2.5">Proposed / Current Value</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {changes.map((chg, idx) => {
            const isAdded = chg.oldValue === null || chg.oldValue === undefined || chg.oldValue === '';
            const isRemoved = chg.newValue === null || chg.newValue === undefined || chg.newValue === '';

            return (
              <tr key={idx} className="hover:bg-canvas/40 transition-colors">
                <td className="px-3.5 py-2.5 font-medium text-text-primary flex items-center gap-1.5">
                  {isAdded ? (
                    <Plus className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                  ) : isRemoved ? (
                    <Minus className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                  ) : (
                    <Edit2 className="w-3 h-3 text-brand-primary flex-shrink-0" />
                  )}
                  <span>{chg.label || chg.field}</span>
                </td>
                <td className="px-3.5 py-2.5 text-text-secondary tabular-nums line-through decoration-rose-300">
                  {formatVal(chg.oldValue, chg.type)}
                </td>
                <td className={`px-3.5 py-2.5 font-semibold tabular-nums ${
                  isRemoved ? 'text-rose-700 bg-rose-50/30' : 'text-emerald-800 bg-emerald-50/40'
                }`}>
                  {formatVal(chg.newValue, chg.type)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
