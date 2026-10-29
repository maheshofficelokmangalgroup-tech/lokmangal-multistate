import React, { useState } from 'react';
import {
  Search,
  Bell,
  LogOut,
  ShieldCheck,
  User,
  ExternalLink,
  ChevronDown,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { RoleCode } from '../../types';

interface TopbarProps {
  currentRouteTitle: string;
  onOpenCommandPalette: () => void;
  onPublishClick?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentRouteTitle,
  onOpenCommandPalette,
  onPublishClick,
}) => {
  const { user, switchRole, logout } = useAuth();
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const roles: Array<{ code: RoleCode; label: string; desc: string }> = [
    { code: 'super_admin', label: 'Super Admin', desc: 'All modules & management' },
    { code: 'finance_maker', label: 'Finance Maker', desc: 'Create & edit rate proposals' },
    { code: 'finance_checker', label: 'Finance Checker', desc: 'Sign off & approve rates (cannot be maker)' },
    { code: 'branch_manager', label: 'Branch Manager', desc: 'Solapur Main leads only' },
    { code: 'editor', label: 'Content Editor', desc: 'Pages, blog, notices only' },
    { code: 'hr', label: 'HR Manager', desc: 'Careers & resumes only' },
    { code: 'auditor', label: 'Internal Auditor', desc: 'Read-only masked records' },
  ];

  return (
    <header className="h-16 bg-surface border-b border-border px-4 sm:px-6 flex items-center justify-between z-20">
      {/* Left: Breadcrumbs & Current Route */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="font-medium text-text-secondary/80">Admin</span>
          <span className="text-text-secondary/40">/</span>
          <span className="font-semibold text-text-primary">{currentRouteTitle}</span>
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Command Search Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-control border border-border bg-canvas text-xs text-text-secondary hover:border-brand/40 hover:text-text-primary transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Quick Search...</span>
          <kbd className="ml-1 px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono font-medium">
            Ctrl+K
          </kbd>
        </button>

        {/* View Public Website */}
        <a
          href="http://localhost:4321"
          target="_blank"
          rel="noreferrer"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-medium text-text-secondary hover:text-brand-primary hover:bg-brand-soft transition-colors"
          title="Open live public website in new tab"
        >
          <span>View Site</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {/* Role Switcher Menu (Interactive Role Testing) */}
        <div className="relative">
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-brand/20 bg-brand-soft text-brand-primary text-xs font-semibold hover:bg-orange-100 transition-colors"
            title="Switch staff role for testing"
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{user?.roleTitle}</span>
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-2 w-72 rounded-panel bg-surface border border-border shadow-dropdown p-2 z-50 animate-in fade-in zoom-in-95">
              <div className="px-2 py-1.5 border-b border-border mb-1">
                <p className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-brand-primary" />
                  <span>Simulate Role & Permissions</span>
                </p>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  Test Maker-Checker and role boundaries
                </p>
              </div>
              <div className="space-y-1">
                {roles.map((r) => (
                  <button
                    key={r.code}
                    onClick={() => {
                      switchRole(r.code);
                      setShowRoleMenu(false);
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-control text-xs transition-colors ${
                      user?.role === r.code
                        ? 'bg-brand-soft text-brand-primary font-bold'
                        : 'text-text-secondary hover:bg-canvas hover:text-text-primary'
                    }`}
                  >
                    <div className="font-semibold">{r.label}</div>
                    <div className="text-[10px] text-text-secondary/80">{r.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-control text-text-secondary hover:text-text-primary hover:bg-canvas transition-colors"
            aria-label="View notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-primary ring-2 ring-surface" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-panel bg-surface border border-border shadow-dropdown p-3 z-50 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="text-xs font-bold text-text-primary">Staff Notifications</span>
                <span className="text-[10px] font-semibold text-brand-primary">2 Unread</span>
              </div>
              <div className="divide-y divide-border text-xs mt-2">
                <div className="py-2">
                  <p className="font-medium text-text-primary">Rate Set 2027–28 pending approval</p>
                  <p className="text-[11px] text-text-secondary mt-0.5">Submitted by Finance Officer</p>
                  <span className="text-[10px] text-text-secondary/70">10 mins ago</span>
                </div>
                <div className="py-2">
                  <p className="font-medium text-text-primary">New loan lead LMS-2026-00123</p>
                  <p className="text-[11px] text-text-secondary mt-0.5">Assigned to Solapur Main branch</p>
                  <span className="text-[10px] text-text-secondary/70">30 mins ago</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Account / Logout */}
        <div className="flex items-center gap-2 pl-2 border-l border-border">
          <button
            onClick={logout}
            className="p-1.5 rounded-control text-text-secondary hover:text-status-destructive hover:bg-rose-50 transition-colors"
            title="Sign out of admin session"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
