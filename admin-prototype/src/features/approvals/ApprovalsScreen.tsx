import React, { useState } from 'react';
import {
  CheckSquare,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  User,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
  MessageSquare,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { canApproveRevision } from '../../lib/permissions';
import { INITIAL_APPROVALS } from '../../lib/api';
import type { ApprovalItem } from '../../types';

export const ApprovalsScreen: React.FC = () => {
  const { user, permissions } = useAuth();
  const { addToast } = useToast();

  const [approvals, setApprovals] = useState<ApprovalItem[]>(INITIAL_APPROVALS);
  const [selectedItem, setSelectedItem] = useState<ApprovalItem>(approvals[0]);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionComment, setRejectionComment] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Check if current user is allowed to approve this specific item
  const canApproveCurrent = user ? canApproveRevision(user, selectedItem.makerId) : false;
  const isMakerOfItem = user?.id === selectedItem.makerId;

  // Approve action
  const handleApprove = (item: ApprovalItem) => {
    if (!canApproveCurrent) {
      addToast({
        type: 'error',
        title: 'Maker-Checker Violation',
        message: 'The submitter (maker) cannot approve their own financial revision.',
      });
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      setApprovals((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, status: 'approved' as const } : a))
      );
      setSelectedItem((prev) => ({ ...prev, status: 'approved' as const }));
      setIsProcessing(false);
      addToast({
        type: 'success',
        title: 'Revision Approved',
        message: `Approved "${item.title}". It is now scheduled and ready for publication.`,
      });
    }, 400);
  };

  // Reject action
  const handleRejectConfirm = () => {
    if (!rejectionComment.trim()) {
      addToast({
        type: 'warning',
        title: 'Comment Required',
        message: 'You must provide a reason when rejecting a sign-off request.',
      });
      return;
    }

    setIsProcessing(true);
    setTimeout(() => {
      setApprovals((prev) =>
        prev.map((a) => (a.id === selectedItem.id ? { ...a, status: 'rejected' as const } : a))
      );
      setSelectedItem((prev) => ({ ...prev, status: 'rejected' as const }));
      setIsProcessing(false);
      setRejectModalOpen(false);
      setRejectionComment('');
      addToast({
        type: 'info',
        title: 'Revision Rejected',
        message: 'Returned to maker as draft with your feedback.',
      });
    }, 400);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Approvals Queue (Maker–Checker)"
        description="Two-person sign-off workflow. Financial rates, loan terms and branch details must be verified by an independent checker before publication."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            {approvals.filter((a) => a.status === 'pending').length} Pending Review
          </span>
        }
      />

      {/* Two Column Layout: Queue on Left, Detailed Review on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Queue List */}
        <div className="lg:col-span-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary px-1">
            Items Requiring Review
          </h3>
          <div className="space-y-2.5">
            {approvals.map((item) => {
              const isSelected = selectedItem.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`p-4 rounded-panel border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-surface border-brand-primary shadow-dropdown ring-1 ring-brand-primary/20'
                      : 'bg-surface border-border hover:border-brand/40 shadow-card'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-brand-primary uppercase">
                      {item.entityType.replace('_', ' ')}
                    </span>
                    <StatusBadge status={item.status} />
                  </div>
                  <h4 className="text-sm font-bold text-text-primary mt-1.5">{item.title}</h4>
                  <p className="text-xs text-text-secondary line-clamp-2 mt-1">{item.summary}</p>

                  <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-[11px] text-text-secondary">
                    <span>Maker: {item.makerName.split(' ')[0]}</span>
                    <span>Eff: {item.effectiveDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Selected Item Diff & Actions */}
        <div className="lg:col-span-7 bg-surface p-6 rounded-panel border border-border shadow-card flex flex-col justify-between">
          <div className="space-y-6">
            {/* Header info */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-primary uppercase tracking-wider">
                  {selectedItem.entityType.replace('_', ' ')}
                </span>
                <StatusBadge status={selectedItem.status} size="md" />
              </div>
              <h2 className="text-lg font-bold text-text-primary mt-1">{selectedItem.title}</h2>
              <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                {selectedItem.summary}
              </p>
            </div>

            {/* Submitter & Effective Date Meta */}
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-control bg-canvas border border-border text-xs">
              <div>
                <span className="text-text-secondary block">Prepared & Submitted By:</span>
                <span className="font-semibold text-text-primary">{selectedItem.makerName}</span>
              </div>
              <div>
                <span className="text-text-secondary block">Requested Effective Date:</span>
                <span className="font-semibold text-text-primary">{selectedItem.effectiveDate}</span>
              </div>
            </div>

            {/* Detailed Changes / Side-by-side Diff */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-brand-primary" />
                <span>Exact Values Changed ({selectedItem.changes.length})</span>
              </h4>
              <div className="border border-border rounded-control overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-canvas border-b border-border font-semibold text-text-secondary uppercase">
                    <tr>
                      <th className="px-3.5 py-2.5">Field / Term</th>
                      <th className="px-3.5 py-2.5">Existing Value</th>
                      <th className="px-3.5 py-2.5">Proposed New Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {selectedItem.changes.map((chg) => (
                      <tr key={chg.field} className="hover:bg-canvas/50">
                        <td className="px-3.5 py-2.5 font-medium text-text-primary">{chg.field}</td>
                        <td className="px-3.5 py-2.5 text-text-secondary tabular-nums line-through decoration-red-400">
                          {chg.oldValue}
                        </td>
                        <td className="px-3.5 py-2.5 font-bold text-emerald-800 bg-emerald-50/50 tabular-nums">
                          {chg.newValue}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Maker-Checker Rule Warning */}
            {isMakerOfItem && (
              <div className="p-3.5 rounded-control bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Self-Approval Prohibited</p>
                  <p className="mt-0.5">
                    You prepared and submitted this revision. In accordance with banking maker–checker regulations, an independent reviewer (Checker) must sign off.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="mt-8 pt-4 border-t border-border flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              Logged as: <strong className="text-text-primary">{user?.name}</strong> ({user?.roleTitle})
            </span>

            {selectedItem.status === 'pending' ? (
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setRejectModalOpen(true)}
                  disabled={!permissions.canApproveRates && user?.role !== 'super_admin'}
                  className="px-3.5 py-2 rounded-control border border-rose-200 text-status-destructive bg-rose-50/50 hover:bg-rose-100 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-40"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject with Feedback</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleApprove(selectedItem)}
                  disabled={!canApproveCurrent || isProcessing}
                  className="px-4 py-2 rounded-control bg-status-success hover:bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-subtle transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  title={
                    !canApproveCurrent
                      ? 'Maker cannot approve their own changes (Switch role to General Manager to approve)'
                      : undefined
                  }
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isProcessing ? 'Recording...' : 'Approve & Schedule'}</span>
                </button>
              </div>
            ) : (
              <span className="text-xs font-semibold text-text-secondary">
                This item has already been decided ({selectedItem.status}).
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Reject Reason Dialog */}
      <ConfirmDialog
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        onConfirm={handleRejectConfirm}
        title="Reject Proposed Revision"
        description="Provide clear feedback for the maker explaining what needs correction before resubmission."
        confirmLabel="Reject Revision"
        variant="danger"
      />
    </div>
  );
};
