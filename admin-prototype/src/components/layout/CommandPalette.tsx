import React, { useState, useEffect } from 'react';
import {
  Search,
  LayoutDashboard,
  Inbox,
  Percent,
  PiggyBank,
  Landmark,
  MapPin,
  CheckSquare,
  UploadCloud,
  Users,
  ShieldAlert,
  Settings,
  Newspaper,
  Bell,
  X,
} from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (route: string) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');

  const commands = [
    { id: 'dashboard', label: 'Dashboard Overview', group: 'Navigation', icon: LayoutDashboard },
    { id: 'leads', label: 'Leads & Enquiries Inbox', group: 'Navigation', icon: Inbox },
    { id: 'rates', label: 'Interest Rates Matrix (व्याजदर)', group: 'Products', icon: Percent },
    { id: 'deposits', label: 'Deposit Schemes (ठेवी योजना)', group: 'Products', icon: PiggyBank },
    { id: 'loans', label: 'Loan Products (कर्ज योजना)', group: 'Products', icon: Landmark },
    { id: 'branches', label: 'Branches Locator & Managers', group: 'Website', icon: MapPin },
    { id: 'posts', label: 'Blog & News Articles', group: 'Website', icon: Newspaper },
    { id: 'notices', label: 'Notices, AGM & Annual Reports', group: 'Website', icon: Bell },
    { id: 'approvals', label: 'Maker-Checker Approvals Queue', group: 'Publishing', icon: CheckSquare },
    { id: 'publish', label: 'Publish Center & Rollback', group: 'Publishing', icon: UploadCloud },
    { id: 'users', label: 'Users & Roles Management', group: 'Admin', icon: Users },
    { id: 'audit', label: 'Immutable Audit Trail', group: 'Admin', icon: ShieldAlert },
    { id: 'settings', label: 'Organisation Settings', group: 'Admin', icon: Settings },
  ];

  const filtered = query.trim()
    ? commands.filter((cmd) => cmd.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        isOpen ? onClose() : {};
      }
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-6 md:p-20">
      <div onClick={onClose} className="fixed inset-0 bg-black/40 backdrop-blur-xs animate-in fade-in" />

      <div className="relative mx-auto max-w-xl transform rounded-panel bg-surface shadow-2xl border border-border overflow-hidden transition-all animate-in zoom-in-95">
        <div className="flex items-center px-4 border-b border-border">
          <Search className="w-5 h-5 text-text-secondary" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a screen name or command (e.g. rates, leads, branches)..."
            autoFocus
            className="w-full px-3 py-4 text-sm bg-transparent border-0 focus:outline-none text-text-primary placeholder:text-text-secondary/60"
          />
          <button onClick={onClose} className="p-1 rounded-sm text-text-secondary hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-border/60">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-secondary">
              No matching modules found.
            </div>
          ) : (
            filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-control text-sm text-left hover:bg-brand-soft hover:text-brand-primary transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-text-secondary group-hover:text-brand-primary" />
                    <span className="font-medium text-text-primary group-hover:text-brand-primary">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-text-secondary uppercase">
                    {item.group}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
