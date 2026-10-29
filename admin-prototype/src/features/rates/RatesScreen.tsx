import React, { useState } from 'react';
import {
  Percent,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  History,
  Copy,
  Send,
  Eye,
  CheckSquare,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { INITIAL_RATE_SET } from '../../lib/api';
import type { RateSet, RateEntry } from '../../types';

export const RatesScreen: React.FC<{ onNavigateToApprovals?: () => void }> = ({
  onNavigateToApprovals,
}) => {
  const { user, permissions } = useAuth();
  const { addToast } = useToast();

  const [activeSet, setActiveSet] = useState<RateSet>(INITIAL_RATE_SET);
  const [editingSet, setEditingSet] = useState<RateSet>({
    ...INITIAL_RATE_SET,
    id: 'rs_2027_28_draft',
    name: 'Proposed Rate Set 2027–28 (प्रस्तावित २०२७-२८)',
    financialYear: '2027-28',
    validFrom: '2027-04-01',
    validUntil: '2028-03-31',
    status: 'draft',
    entries: INITIAL_RATE_SET.entries.map((e) => ({
      ...e,
      previousValue: e.value,
      value: e.key === 'fd.slab_5' ? '9.75' : e.key === 'fd.senior_bonus' ? '0.75' : e.value,
    })),
  });

  const [viewMode, setViewMode] = useState<'matrix' | 'diff'>('matrix');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Update cell value
  const handleRateChange = (entryId: string, newVal: string) => {
    setEditingSet((prev) => ({
      ...prev,
      entries: prev.entries.map((e) => (e.id === entryId ? { ...e, value: newVal } : e)),
    }));
  };

  // Submit to Maker-Checker approval queue
  const handleSubmitForApproval = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setEditingSet((prev) => ({ ...prev, status: 'pending_approval' }));
      addToast({
        type: 'success',
        title: 'Rate Revision Submitted for Sign-off',
        message:
          'Rate set 2027–28 submitted to Approvals Queue. A different person (Checker) must approve.',
      });
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Interest Rates Management (व्याजदर)"
        description="Single source of truth. Entered rates automatically calculate all website tables, leaflet figures and deposit schemes."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            Active: FY {activeSet.financialYear}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode(viewMode === 'matrix' ? 'diff' : 'matrix')}
              className="px-3.5 py-2 rounded-control bg-surface border border-border text-xs font-semibold text-text-primary hover:bg-canvas transition-colors flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5 text-brand-primary" />
              <span>{viewMode === 'matrix' ? 'Compare Changes (Diff)' : 'Standard Matrix'}</span>
            </button>

            {permissions.canEditRates && editingSet.status === 'draft' && (
              <button
                onClick={handleSubmitForApproval}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-control bg-brand-primary hover:bg-brand-hover text-white text-xs font-semibold flex items-center gap-1.5 shadow-subtle transition-colors disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit for Approval (Maker)</span>
              </button>
            )}

            {editingSet.status === 'pending_approval' && (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1.5 rounded-control text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                  Awaiting Checker Approval
                </span>
                {onNavigateToApprovals && (
                  <button
                    onClick={onNavigateToApprovals}
                    className="px-3 py-1.5 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover transition-colors"
                  >
                    Open Approvals
                  </button>
                )}
              </div>
            )}
          </div>
        }
      />

      {/* Maker-Checker Info Callout */}
      <div className="p-4 rounded-panel bg-brand-soft border border-brand/20 flex items-start gap-3.5">
        <ShieldCheck className="w-5 h-5 text-brand-primary flex-shrink-0 mt-0.5" />
        <div className="text-xs text-text-primary space-y-1">
          <p className="font-bold text-sm text-brand-primary">
            Financial Integrity & Two-Person Sign-off (Maker–Checker)
          </p>
          <p className="text-text-secondary leading-relaxed">
            Every rate change is entered once as a pure number. No financial change goes live without approval by an independent reviewer (Checker). Even Super Admins cannot approve a change they themselves submitted.
          </p>
        </div>
      </div>

      {/* Active Rate Set & Proposed Rate Set Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Active Rate Set Summary */}
        <div className="p-4 bg-surface rounded-panel border border-border shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-text-secondary uppercase tracking-wider">
              Currently Live Rate Set
            </span>
            <StatusBadge status={activeSet.status} />
          </div>
          <p className="text-base font-bold text-text-primary mt-2">{activeSet.name}</p>
          <p className="text-xs text-text-secondary mt-1">
            Validity: {activeSet.validFrom} to {activeSet.validUntil} (IST)
          </p>
          <div className="mt-3 text-[11px] text-text-secondary flex items-center gap-2">
            <span>Approved by: {activeSet.checker?.name}</span>
          </div>
        </div>

        {/* Proposed Rate Set Summary */}
        <div className="p-4 bg-surface rounded-panel border border-brand/30 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">
              Draft / Proposed Revision
            </span>
            <StatusBadge status={editingSet.status} />
          </div>
          <p className="text-base font-bold text-text-primary mt-2">{editingSet.name}</p>
          <p className="text-xs text-text-secondary mt-1">
            Target Effective Period: {editingSet.validFrom} to {editingSet.validUntil}
          </p>
          <div className="mt-3 text-[11px] text-text-secondary flex items-center gap-2">
            <span>Prepared by: {user?.name} (Maker)</span>
          </div>
        </div>
      </div>

      {/* Main Rates Spreadsheet Matrix */}
      <div className="bg-surface rounded-panel border border-border shadow-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-bold text-text-primary">
            {viewMode === 'matrix' ? 'Rate Values Matrix' : 'Side-by-Side Comparison (Diff)'}
          </h3>
          <span className="text-xs text-text-secondary">
            {editingSet.entries.length} items configured
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-border text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">Category / Slab</th>
                <th className="px-4 py-3">Tenure / Days</th>
                <th className="px-4 py-3">Currently Live Rate</th>
                <th className="px-4 py-3">Proposed Rate ({editingSet.financialYear})</th>
                <th className="px-4 py-3">Change Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {editingSet.entries.map((entry) => {
                const liveEntry = activeSet.entries.find((e) => e.key === entry.key);
                const hasChanged = liveEntry && liveEntry.value !== entry.value;

                return (
                  <tr
                    key={entry.id}
                    className={`hover:bg-canvas/60 transition-colors ${
                      hasChanged ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold text-text-primary text-xs">
                      {entry.label}
                      <span className="block font-mono text-[10px] text-text-secondary font-normal">
                        {entry.key}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {entry.minDays ? `${entry.minDays} – ${entry.maxDays ?? 'Above'} Days` : 'Fixed / Scheme'}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums font-semibold text-text-secondary">
                      {liveEntry?.value ? `${liveEntry.value} ${liveEntry.unit === 'percent' ? '% p.a.' : 'Months'}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {permissions.canEditRates && editingSet.status === 'draft' ? (
                        <div className="flex items-center gap-1.5 max-w-[140px]">
                          <input
                            type="text"
                            value={entry.value}
                            onChange={(e) => handleRateChange(entry.id, e.target.value)}
                            className={`w-20 px-2 py-1 text-xs text-right font-bold tabular-nums bg-canvas border rounded-control focus:outline-none focus:border-brand-primary ${
                              hasChanged ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-border'
                            }`}
                          />
                          <span className="text-[11px] text-text-secondary">
                            {entry.unit === 'percent' ? '%' : 'M'}
                          </span>
                        </div>
                      ) : (
                        <span className="font-bold tabular-nums text-text-primary">
                          {entry.value} {entry.unit === 'percent' ? '% p.a.' : 'Months'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {hasChanged ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          <TrendingUp className="w-3 h-3 text-amber-700" />
                          <span>Modified ({liveEntry?.value} → {entry.value})</span>
                        </span>
                      ) : (
                        <span className="text-[11px] text-text-secondary">Unchanged</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
