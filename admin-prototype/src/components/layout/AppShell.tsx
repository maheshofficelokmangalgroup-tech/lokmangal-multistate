import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';

interface AppShellProps {
  currentRoute: string;
  currentRouteTitle: string;
  onNavigate: (route: string) => void;
  children: React.ReactNode;
  pendingApprovalsCount?: number;
  newLeadsCount?: number;
  openApplicationsCount?: number;
}

export const AppShell: React.FC<AppShellProps> = ({
  currentRoute,
  currentRouteTitle,
  onNavigate,
  children,
  pendingApprovalsCount,
  newLeadsCount,
  openApplicationsCount,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas">
      {/* Sidebar */}
      <Sidebar
        currentRoute={currentRoute}
        onNavigate={onNavigate}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        pendingApprovalsCount={pendingApprovalsCount}
        newLeadsCount={newLeadsCount}
        openApplicationsCount={openApplicationsCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar
          currentRouteTitle={currentRouteTitle}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </main>
      </div>

      {/* Quick Switcher Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={onNavigate}
      />
    </div>
  );
};
