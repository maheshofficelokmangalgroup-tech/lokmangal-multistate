import React from 'react';
import {
  LayoutDashboard,
  Inbox,
  Briefcase,
  Percent,
  PiggyBank,
  Landmark,
  Home,
  FileText,
  Newspaper,
  Image,
  Bell,
  MapPin,
  FolderOpen,
  Navigation,
  Globe,
  CheckSquare,
  UploadCloud,
  Users,
  ShieldAlert,
  Settings,
  ChevronLeft,
  ChevronRight,
  Shield,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface NavItem {
  id: string;
  label: string;
  icon: any;
  badge?: string;
  badgeVariant?: 'brand' | 'warning';
  visible: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  pendingApprovalsCount?: number;
  newLeadsCount?: number;
  openApplicationsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
  pendingApprovalsCount = 2,
  newLeadsCount = 4,
  openApplicationsCount = 3,
}) => {
  const { user, permissions } = useAuth();

  const navGroups: NavGroup[] = [
    {
      title: 'Workspace',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard',
          icon: LayoutDashboard,
          visible: permissions.canViewDashboard,
        },
        {
          id: 'leads',
          label: 'Leads & Enquiries',
          icon: Inbox,
          badge: newLeadsCount > 0 ? String(newLeadsCount) : undefined,
          visible: permissions.canViewAllLeads || permissions.canViewOwnBranchLeads,
        },
        {
          id: 'careers',
          label: 'Careers & Hiring',
          icon: Briefcase,
          badge: openApplicationsCount > 0 ? String(openApplicationsCount) : undefined,
          visible: permissions.canManageCareers || user?.role === 'super_admin',
        },
      ],
    },
    {
      title: 'Products & Banking',
      items: [
        {
          id: 'rates',
          label: 'Interest Rates',
          icon: Percent,
          visible: permissions.canEditRates || permissions.canApproveRates || user?.role === 'super_admin' || user?.role === 'auditor',
        },
        {
          id: 'deposits',
          label: 'Deposit Schemes',
          icon: PiggyBank,
          visible: permissions.canEditRates || permissions.canEditContent || user?.role === 'super_admin',
        },
        {
          id: 'loans',
          label: 'Loan Schemes',
          icon: Landmark,
          visible: permissions.canEditRates || permissions.canEditContent || user?.role === 'super_admin',
        },
      ],
    },
    {
      title: 'Website Content',
      items: [
        {
          id: 'homepage',
          label: 'Homepage & Hero',
          icon: Home,
          visible: permissions.canEditContent || user?.role === 'super_admin',
        },
        {
          id: 'pages',
          label: 'Pages & People',
          icon: FileText,
          visible: permissions.canEditContent || user?.role === 'super_admin',
        },
        {
          id: 'posts',
          label: 'Blog / News',
          icon: Newspaper,
          visible: permissions.canEditContent || user?.role === 'super_admin',
        },
        {
          id: 'gallery',
          label: 'Photo Gallery',
          icon: Image,
          visible: permissions.canEditContent || user?.role === 'super_admin',
        },
        {
          id: 'notices',
          label: 'Notices & Reports',
          icon: Bell,
          visible: permissions.canEditContent || user?.role === 'super_admin',
        },
        {
          id: 'branches',
          label: 'Branches (६०+)',
          icon: MapPin,
          visible: true, // All roles can see branches
        },
        {
          id: 'media',
          label: 'Media Library',
          icon: FolderOpen,
          visible: permissions.canEditContent || user?.role === 'super_admin',
        },
        {
          id: 'navigation',
          label: 'Navigation & SEO',
          icon: Globe,
          visible: permissions.canEditContent || user?.role === 'super_admin',
        },
      ],
    },
    {
      title: 'Publishing & Sign-off',
      items: [
        {
          id: 'approvals',
          label: 'Approvals Queue',
          icon: CheckSquare,
          badge: pendingApprovalsCount > 0 ? String(pendingApprovalsCount) : undefined,
          badgeVariant: 'warning',
          visible: permissions.canApproveRates || user?.role === 'super_admin' || user?.role === 'finance_maker',
        },
        {
          id: 'publish',
          label: 'Publish Center',
          icon: UploadCloud,
          visible: permissions.canPublishSite || permissions.canEditContent || user?.role === 'super_admin',
        },
      ],
    },
    {
      title: 'Administration',
      items: [
        {
          id: 'users',
          label: 'Users & Roles',
          icon: Users,
          visible: permissions.canManageUsers,
        },
        {
          id: 'audit',
          label: 'Audit Trail',
          icon: ShieldAlert,
          visible: permissions.canViewAuditLog,
        },
        {
          id: 'settings',
          label: 'Organisation Settings',
          icon: Settings,
          visible: permissions.canManageSettings,
        },
      ],
    },
  ];

  return (
    <aside
      className={`bg-surface border-r border-border flex flex-col transition-all duration-300 z-30 select-none ${
        isCollapsed ? 'w-[76px]' : 'w-[248px]'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 px-4 border-b border-border flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-control bg-brand-primary text-white flex items-center justify-center font-bold text-sm shadow-xs flex-shrink-0">
              LM
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold tracking-tight text-text-primary block truncate">
                LOKMANGAL
              </span>
              <span className="text-[10px] uppercase tracking-wider text-text-secondary block font-semibold truncate">
                Multistate Admin
              </span>
            </div>
          </div>
        )}

        {isCollapsed && (
          <div className="w-9 h-9 mx-auto rounded-control bg-brand-primary text-white flex items-center justify-center font-bold text-sm shadow-xs">
            LM
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-control text-text-secondary hover:text-text-primary hover:bg-canvas transition-colors hidden sm:flex items-center justify-center"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-6">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => item.visible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title} className="space-y-1">
              {!isCollapsed && (
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-text-secondary/80">
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = currentRoute === item.id;
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-control text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-brand-soft text-brand-primary font-semibold shadow-subtle'
                          : 'text-text-secondary hover:text-text-primary hover:bg-canvas'
                      } ${isCollapsed ? 'justify-center px-0' : ''}`}
                      title={isCollapsed ? item.label : undefined}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-brand-primary' : 'text-text-secondary'}`} />
                      {!isCollapsed && <span className="flex-1 text-left truncate">{item.label}</span>}
                      {!isCollapsed && item.badge && (
                        <span
                          className={`text-[11px] font-bold px-1.5 py-0.2 rounded-full ${
                            item.badgeVariant === 'warning'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-brand-primary text-white'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* User Scope Footer */}
      <div className="p-3 border-t border-border bg-canvas/40">
        {!isCollapsed ? (
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <Building2 className="w-3.5 h-3.5 text-brand-primary flex-shrink-0" />
            <span className="truncate">
              {user?.branchName ? `Branch: ${user.branchName}` : 'All Regions & Branches'}
            </span>
          </div>
        ) : (
          <div className="flex justify-center" title={user?.branchName ?? 'Head Office'}>
            <Building2 className="w-4 h-4 text-brand-primary" />
          </div>
        )}
      </div>
    </aside>
  );
};
