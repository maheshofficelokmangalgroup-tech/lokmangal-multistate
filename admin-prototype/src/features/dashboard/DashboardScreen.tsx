import React from 'react';
import {
  Inbox,
  CheckSquare,
  UploadCloud,
  Calendar,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  Clock,
  Sparkles,
  MapPin,
  Building,
} from 'lucide-react';
import { MetricCard } from '../../components/common/MetricCard';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useAuth } from '../../context/AuthContext';

interface DashboardScreenProps {
  onNavigate: (route: string) => void;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({ onNavigate }) => {
  const { user, permissions, branchScope } = useAuth();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Operations Dashboard"
        description={
          branchScope
            ? `Viewing authorized branch: ${branchScope}`
            : 'Multi-branch operations, leads, rate validity and publishing control.'
        }
        badge={
          branchScope ? (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-soft text-brand-primary border border-brand/20">
              {branchScope}
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              All 60+ Branches
            </span>
          )
        }
        actions={
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onNavigate('publish')}
              className="px-4 py-2 rounded-control bg-brand-primary hover:bg-brand-hover text-white text-xs font-semibold flex items-center gap-1.5 shadow-subtle transition-colors"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Publish Center</span>
            </button>
          </div>
        }
      />

      {/* Top 4 Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="New Leads Today"
          value="12"
          subtitle="48 this week (+14%)"
          icon={Inbox}
          badge="+14%"
          badgeVariant="success"
          onClick={() => onNavigate('leads')}
        />
        <MetricCard
          title="Pending Approvals"
          value="2"
          subtitle="1 Rate Set, 1 Branch Edit"
          icon={CheckSquare}
          badge="Action Needed"
          badgeVariant="warning"
          onClick={() => onNavigate('approvals')}
        />
        <MetricCard
          title="Awaiting Release"
          value="5"
          subtitle="Changes ready to publish"
          icon={UploadCloud}
          badge="Drafts Ready"
          badgeVariant="brand"
          onClick={() => onNavigate('publish')}
        />
        <MetricCard
          title="Rates Valid Until"
          value="31 Mar 27"
          subtitle="Rate Set 2026–27 Live"
          icon={Calendar}
          badge="Healthy"
          badgeVariant="success"
          onClick={() => onNavigate('rates')}
        />
      </div>

      {/* Leads Breakdown (Type & Branch) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads by Type */}
        <div className="bg-surface p-5 rounded-panel border border-border shadow-card">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Enquiries by Product Type</h3>
              <p className="text-xs text-text-secondary mt-0.5">Website form conversion distribution</p>
            </div>
            <button
              onClick={() => onNavigate('leads')}
              className="text-xs text-brand-primary hover:underline font-semibold flex items-center gap-1"
            >
              <span>View Inbox</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3.5">
            {[
              { label: 'Loan Applications (गृह/वाहन/वैयक्तिक)', count: 24, percent: 50, color: 'bg-brand-primary' },
              { label: 'Deposit Schemes (लक्षाधीश / FD / RD)', count: 14, percent: 30, color: 'bg-emerald-600' },
              { label: 'Account Opening (बचत खाते)', count: 6, percent: 12, color: 'bg-blue-600' },
              { label: 'Callback & General Enquiries', count: 4, percent: 8, color: 'bg-amber-600' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-text-primary">{item.label}</span>
                  <span className="font-bold tabular-nums text-text-secondary">
                    {item.count} ({item.percent}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-canvas overflow-hidden">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Leads by Branch */}
        <div className="bg-surface p-5 rounded-panel border border-border shadow-card">
          <div className="flex items-center justify-between pb-4 border-b border-border">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Top Branches by Lead Volume</h3>
              <p className="text-xs text-text-secondary mt-0.5">Enquiry assignment & demand by location</p>
            </div>
            <button
              onClick={() => onNavigate('branches')}
              className="text-xs text-brand-primary hover:underline font-semibold flex items-center gap-1"
            >
              <span>All Branches</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {[
              { branch: 'Solapur Main (सोलापूर मुख्य)', count: 18, code: 'LMS-001', region: 'Solapur' },
              { branch: 'Pune Kothrud (पुणे कोथरूड)', count: 12, code: 'LMS-014', region: 'Pune' },
              { branch: 'Pandharpur (पंढरपूर)', count: 8, code: 'LMS-008', region: 'Solapur' },
              { branch: 'Latur Main (लातूर मुख्य)', count: 6, code: 'LMS-022', region: 'Marathwada' },
              { branch: 'Kolhapur Shahupuri (कोल्हापूर)', count: 4, code: 'LMS-035', region: 'W. Maharashtra' },
            ].map((b, idx) => (
              <div
                key={b.code}
                className="flex items-center justify-between p-2.5 rounded-control bg-canvas/70 border border-border/60 hover:bg-brand-soft/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-brand-soft text-brand-primary text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-text-primary">{b.branch}</p>
                    <p className="text-[11px] text-text-secondary">{b.code} · {b.region}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-brand-primary tabular-nums">
                    {b.count} leads
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Two columns: Pending Actions & Live Release Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Approvals Action Required */}
        <div className="lg:col-span-2 bg-surface p-5 rounded-panel border border-border shadow-card">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-brand-primary" />
              <span>Pending Sign-offs (Maker–Checker)</span>
            </h3>
            <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              2 Pending
            </span>
          </div>

          <div className="mt-3 divide-y divide-border">
            <div className="py-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-text-primary">
                  Rate Set 2027–28: Proposed Interest Rate Revision
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Senior Citizen bonus 0.75%, 1-2 Yr FD slab 9.75% · Maker: Manoj Joshi (Finance Officer)
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-text-secondary">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Submitted Today at 08:30 IST</span>
                  <span>·</span>
                  <span className="font-semibold text-amber-700">Requires Independent Checker</span>
                </div>
              </div>
              <button
                onClick={() => onNavigate('approvals')}
                className="px-3 py-1.5 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle flex-shrink-0"
              >
                Review & Sign Off
              </button>
            </div>

            <div className="py-3 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-text-primary">
                  Branch Timings Update: Solapur Main Branch
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Extended evening cash counter hours till 5:30 PM · Maker: Rajendra Jagtap (Branch Mgr)
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-text-secondary">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Submitted Yesterday</span>
                </div>
              </div>
              <button
                onClick={() => onNavigate('approvals')}
                className="px-3 py-1.5 rounded-control bg-canvas border border-border text-text-primary text-xs font-semibold hover:bg-zinc-200/60 flex-shrink-0"
              >
                View Changes
              </button>
            </div>
          </div>
        </div>

        {/* Live Serving Release Widget */}
        <div className="bg-surface p-5 rounded-panel border border-border shadow-card flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Website Release
              </span>
              <StatusBadge status="live" />
            </div>
            <div className="mt-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-text-primary">
                  Build #214
                </span>
                <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Active
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-1">
                Published today at 09:30 IST (41s build time)
              </p>

              <div className="mt-4 p-3 rounded-control bg-canvas border border-border text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Prerendered Pages:</span>
                  <span className="font-semibold text-text-primary">90 HTML Files</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Content Hash:</span>
                  <span className="font-mono text-text-secondary">sha256-8a7e3c</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Rollback Available:</span>
                  <span className="font-semibold text-emerald-700">Last 10 Builds</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => onNavigate('publish')}
              className="w-full py-2 rounded-control bg-brand-soft border border-brand/20 text-brand-primary text-xs font-semibold hover:bg-orange-100 transition-colors"
            >
              Open Publish Center
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
