import React, { useState } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  Clock,
  RotateCcw,
  Eye,
  FileCheck,
  AlertTriangle,
  Sparkles,
  Calendar,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { StatusBadge } from '../../components/common/StatusBadge';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { INITIAL_RELEASES } from '../../lib/api';
import type { ReleaseBuild } from '../../types';

export const PublishScreen: React.FC = () => {
  const { user, permissions } = useAuth();
  const { addToast } = useToast();

  const [releases, setReleases] = useState<ReleaseBuild[]>(INITIAL_RELEASES);
  const [isBuilding, setIsBuilding] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<ReleaseBuild | null>(null);

  // Trigger Live Build (Astro Build with atomic symlink switch)
  const handlePublishNow = () => {
    setIsBuilding(true);
    addToast({
      type: 'info',
      title: 'Site Build Queued',
      message: 'Generating frozen JSON snapshot and running Astro build...',
    });

    setTimeout(() => {
      const newBuildNum = releases[0].buildNumber + 1;
      const newRelease: ReleaseBuild = {
        id: `rel_${newBuildNum}`,
        buildNumber: newBuildNum,
        kind: 'live',
        status: 'live',
        triggeredBy: `${user?.name} (${user?.roleTitle})`,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationSeconds: 38,
        pageCount: 90,
        contentHash: `sha256-${Math.random().toString(36).substring(2, 10)}`,
        isCurrent: true,
        notes: 'Published approved changes via Admin Publish Center.',
      };

      setReleases((prev) => [
        newRelease,
        ...prev.map((r) => ({ ...r, isCurrent: false, status: 'superseded' as const })),
      ]);
      setIsBuilding(false);

      addToast({
        type: 'success',
        title: 'Website Published Successfully!',
        message: `Build #${newBuildNum} is now live with zero downtime. All 90 pages updated.`,
      });
    }, 2000);
  };

  // Rollback confirmation
  const handleRollbackConfirm = () => {
    if (!rollbackTarget) return;

    const target = rollbackTarget;
    setReleases((prev) =>
      prev.map((r) => ({
        ...r,
        isCurrent: r.id === target.id,
        status: r.id === target.id ? ('live' as const) : ('superseded' as const),
      }))
    );

    addToast({
      type: 'success',
      title: 'Rollback Executed',
      message: `Website symlink pointed back to Build #${target.buildNumber} (${target.notes || 'Restored'}). Action recorded in audit log.`,
    });
    setRollbackTarget(null);
  };

  const currentLive = releases.find((r) => r.isCurrent) || releases[0];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Publish Center & Release Controller"
        description="Release management with atomic zero-downtime activation and 1-click rollback."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            Current: Build #{currentLive.buildNumber}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <a
              href="http://localhost:4321"
              target="_blank"
              rel="noreferrer"
              className="px-3.5 py-2 rounded-control bg-surface border border-border text-xs font-semibold text-text-primary hover:bg-canvas transition-colors flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5 text-brand-primary" />
              <span>Preview Build</span>
            </a>

            {permissions.canPublishSite && (
              <button
                onClick={handlePublishNow}
                disabled={isBuilding}
                className="px-4 py-2 rounded-control bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold flex items-center gap-2 shadow-subtle transition-colors disabled:opacity-50"
              >
                <UploadCloud className="w-4 h-4" />
                <span>{isBuilding ? 'Building (Astro)...' : 'Publish Website Now'}</span>
              </button>
            )}
          </div>
        }
      />

      {/* Currently Live Release Banner */}
      <div className="p-5 rounded-panel bg-surface border border-border shadow-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-control bg-emerald-50 border border-emerald-200 text-status-success flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-text-primary">
                Live Build #{currentLive.buildNumber}
              </h3>
              <StatusBadge status="live" />
            </div>
            <p className="text-xs text-text-secondary mt-1">
              Activated by {currentLive.triggeredBy} · Build time: {currentLive.durationSeconds}s · Output: 90 Static HTML pages
            </p>
            <p className="text-xs font-mono text-text-secondary/80 mt-1">
              Content Hash: {currentLive.contentHash}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="http://localhost:4321"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 rounded-control bg-canvas border border-border text-xs font-semibold text-text-primary hover:bg-zinc-200/60 transition-colors flex items-center gap-1.5"
          >
            <span>Visit Live Website</span>
            <ExternalLink className="w-3.5 h-3.5 text-brand-primary" />
          </a>
        </div>
      </div>

      {/* Pending Changes Waiting to be Published */}
      <div className="p-5 rounded-panel bg-surface border border-border shadow-card">
        <h3 className="text-sm font-bold text-text-primary mb-1">
          Unpublished Changes Staged for Release (5)
        </h3>
        <p className="text-xs text-text-secondary mb-4">
          These approved content items will be frozen into the next release snapshot upon clicking "Publish".
        </p>

        <div className="divide-y divide-border border border-border rounded-control overflow-hidden text-xs">
          {[
            { module: 'Deposit Schemes', title: 'Updated Daam Duppat Doubling Example (72 Months)', state: 'Approved' },
            { module: 'Branches', title: 'Solapur Main Cash Counter Hours Extended to 5:30 PM', state: 'Approved' },
            { module: 'News / Blog', title: 'New Article: "यशोगाथा - कर्जदार विकास पाटील"', state: 'Draft' },
            { module: 'Notices', title: 'Diwali Festive Holiday Hours Notice (PDF Attached)', state: 'Approved' },
            { module: 'Homepage', title: 'Featured Scheme Banner Card Reordered', state: 'Draft' },
          ].map((item, i) => (
            <div key={i} className="p-3 flex items-center justify-between hover:bg-canvas/50">
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-brand-primary" />
                <div>
                  <span className="font-semibold text-text-primary block">{item.title}</span>
                  <span className="text-[11px] text-text-secondary">{item.module}</span>
                </div>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  item.state === 'Approved'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                }`}
              >
                {item.state}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Historical Releases with 1-Click Rollback */}
      <div className="bg-surface rounded-panel border border-border shadow-card overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-text-primary">
              Release History & Instant Rollback
            </h3>
            <p className="text-xs text-text-secondary mt-0.5">
              The last 10 successful builds are preserved. Point the serving symlink back in 1 click.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-canvas border-b border-border text-xs font-semibold text-text-secondary uppercase tracking-wider">
                <th className="px-4 py-3">Build</th>
                <th className="px-4 py-3">Published At</th>
                <th className="px-4 py-3">Publisher</th>
                <th className="px-4 py-3">Release Notes</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Rollback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {releases.map((rel) => (
                <tr key={rel.id} className="hover:bg-canvas/60 text-xs">
                  <td className="px-4 py-3 font-bold font-mono text-text-primary">
                    Build #{rel.buildNumber}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {new Date(rel.startedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">{rel.triggeredBy}</td>
                  <td className="px-4 py-3 text-text-secondary max-w-xs truncate">{rel.notes}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={rel.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {rel.isCurrent ? (
                      <span className="text-xs font-bold text-emerald-700">Currently Live</span>
                    ) : (
                      <button
                        onClick={() => setRollbackTarget(rel)}
                        disabled={!permissions.canRollbackSite}
                        className="px-2.5 py-1 rounded-control bg-canvas border border-border text-xs font-semibold text-text-secondary hover:text-brand-primary hover:border-brand/40 flex items-center gap-1.5 ml-auto transition-colors disabled:opacity-40"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Rollback</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirm Rollback Modal */}
      <ConfirmDialog
        isOpen={!!rollbackTarget}
        onClose={() => setRollbackTarget(null)}
        onConfirm={handleRollbackConfirm}
        title={`Rollback to Build #${rollbackTarget?.buildNumber}?`}
        description={`This will atomically switch the live website files to Build #${rollbackTarget?.buildNumber} (${rollbackTarget?.notes || 'Previous release'}). Existing enquiries and database records will remain completely intact.`}
        confirmLabel="Execute 1-Click Rollback"
        variant="warning"
      />
    </div>
  );
};
