import React, { useState } from 'react';
import { History, RotateCcw, Eye, ArrowRight, User, Calendar, CheckCircle2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { FieldDiff, type DiffField } from './FieldDiff';

export interface RevisionItem {
  id: string;
  version: number;
  authorName: string;
  authorRole: string;
  timestamp: string;
  summary: string;
  status: 'published' | 'approved' | 'draft' | 'archived';
  changes: DiffField[];
}

interface RevisionHistoryProps {
  revisions: RevisionItem[];
  currentVersion: number;
  onRestoreRevision?: (revision: RevisionItem) => void;
  entityName: string;
}

export const RevisionHistory: React.FC<RevisionHistoryProps> = ({
  revisions,
  currentVersion,
  onRestoreRevision,
  entityName,
}) => {
  const [selectedRevision, setSelectedRevision] = useState<RevisionItem | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <div className="flex items-center gap-2 text-text-primary font-bold text-sm">
          <History className="w-4 h-4 text-brand-primary" />
          <span>Revision History: {entityName}</span>
        </div>
        <span className="text-xs text-text-secondary">
          Current Version: <strong className="text-text-primary">v{currentVersion}.0</strong>
        </span>
      </div>

      <div className="space-y-3">
        {revisions.map((rev) => {
          const isCurrent = rev.version === currentVersion;
          const isSelected = selectedRevision?.id === rev.id;

          return (
            <div
              key={rev.id}
              className={`p-3.5 rounded-panel border transition-all ${
                isSelected
                  ? 'border-brand-primary bg-surface shadow-subtle ring-1 ring-brand-primary/20'
                  : 'border-border bg-canvas/40 hover:bg-surface'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-text-primary">v{rev.version}.0</span>
                    <StatusBadge status={rev.status} size="sm" />
                    {isCurrent && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-primary/10 text-brand-primary">
                        Live / Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-secondary mt-1">{rev.summary}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedRevision(isSelected ? null : rev)}
                    className="p-1.5 rounded-control text-text-secondary hover:text-brand-primary hover:bg-canvas transition-colors text-xs font-semibold flex items-center gap-1"
                    title="View Changes"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span className="text-[11px]">{isSelected ? 'Hide Diff' : 'View Diff'}</span>
                  </button>

                  {!isCurrent && onRestoreRevision && (
                    <button
                      type="button"
                      onClick={() => onRestoreRevision(rev)}
                      className="px-2 py-1 rounded-control border border-border text-text-secondary hover:text-brand-primary hover:border-brand-primary bg-surface text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Rollback to this version"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span className="text-[11px]">Restore</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 mt-2.5 pt-2 border-t border-border/60 text-[11px] text-text-secondary">
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3 text-zinc-400" />
                  <span>{rev.authorName} ({rev.authorRole})</span>
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-zinc-400" />
                  <span>{rev.timestamp}</span>
                </span>
                <span className="ml-auto font-medium text-text-secondary">
                  {rev.changes.length} field{rev.changes.length === 1 ? '' : 's'} modified
                </span>
              </div>

              {/* Collapsible Diff View */}
              {isSelected && rev.changes.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-2">
                    Changes in this version:
                  </h5>
                  <FieldDiff changes={rev.changes} compact />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
