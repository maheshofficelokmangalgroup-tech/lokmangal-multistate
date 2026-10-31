// Application shell: grouped sidebar (collapsible; a drawer on small screens), topbar with command
// search, notifications and the account menu. Menu items appear only for permitted modules.

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import clsx from 'clsx';
import {
  Bell,
  Briefcase,
  Building2,
  CheckSquare,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  FolderOpen,
  Globe,
  Home,
  Image,
  Inbox,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Navigation,
  Newspaper,
  Percent,
  PiggyBank,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  UploadCloud,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, qs, setCsrfToken, type Data, type Notification } from '../lib/api';
import { fmtRelative } from '../lib/format';
import { useSession } from '../lib/session';

type NavItem = { to: string; label: string; icon: LucideIcon; show: boolean; badge?: number };
type NavGroup = { title: string; items: NavItem[] };

type Counts = { approvals_pending?: number; unreleased_changes?: number; applications_new?: number; leads?: { unhandled: number } };

function useNav(): NavGroup[] {
  const { can, canAny } = useSession();
  const counts = useQuery({ queryKey: ['shell', 'counts'], queryFn: () => api.get<Data<Counts>>('/dashboard?range=today').then((r) => r.data), refetchInterval: 60_000, enabled: can('dashboard.view') });
  const c = counts.data;
  return [
    {
      title: 'Workspace',
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, show: can('dashboard.view') },
        { to: '/leads', label: 'Leads', icon: Inbox, show: canAny('leads.view.all', 'leads.view.own_branch'), badge: c?.leads?.unhandled },
        { to: can('applications.view') ? '/careers/applications' : '/careers/jobs', label: 'Careers', icon: Briefcase, show: canAny('applications.view', 'careers.edit'), badge: c?.applications_new },
      ],
    },
    {
      title: 'Products',
      items: [
        { to: '/products/rates', label: 'Interest rates', icon: Percent, show: canAny('rates.edit', 'financial.approve', 'content.view') },
        { to: '/products/deposits', label: 'Deposit schemes', icon: PiggyBank, show: canAny('products.edit', 'content.view') },
        { to: '/products/loans', label: 'Loans', icon: Landmark, show: canAny('products.edit', 'content.view') },
      ],
    },
    {
      title: 'Website',
      items: [
        { to: '/website/homepage', label: 'Homepage', icon: Home, show: canAny('content.edit', 'content.view') },
        { to: '/website/pages', label: 'Pages and people', icon: FileText, show: canAny('content.edit', 'content.view') },
        { to: '/website/posts', label: 'Blog and news', icon: Newspaper, show: canAny('content.edit', 'content.view') },
        { to: '/website/gallery', label: 'Gallery', icon: Image, show: canAny('content.edit', 'content.view') },
        { to: '/website/notices', label: 'Notices and documents', icon: FolderOpen, show: canAny('content.edit', 'content.view') },
        { to: '/website/branches', label: 'Branches', icon: Building2, show: canAny('branches.edit', 'content.view') },
        { to: '/website/media', label: 'Media library', icon: UploadCloud, show: canAny('media.upload', 'media.manage', 'content.view') },
        { to: '/website/navigation', label: 'Navigation and footer', icon: Navigation, show: canAny('content.edit', 'content.view') },
        { to: '/website/redirects', label: 'SEO and redirects', icon: Globe, show: canAny('content.edit', 'content.view') },
      ],
    },
    {
      title: 'Publishing',
      items: [
        { to: '/approvals', label: 'Approvals', icon: CheckSquare, show: true, badge: c?.approvals_pending },
        { to: '/publish', label: 'Publish center', icon: ShieldCheck, show: canAny('site.publish', 'site.preview'), badge: c?.unreleased_changes },
      ],
    },
    {
      title: 'Administration',
      items: [
        { to: '/admin/users', label: 'Users and roles', icon: Users, show: canAny('users.manage', 'roles.manage') },
        { to: '/admin/audit', label: 'Audit log', icon: ScrollText, show: can('audit.view') },
        { to: '/admin/settings', label: 'Settings', icon: Settings, show: canAny('settings.manage', 'system.health') },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show) }))
    .filter((g) => g.items.length > 0);
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const groups = useNav();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.title} className="mb-5">
          {!collapsed && <p className="mb-1.5 px-2 text-[11px] font-semibold tracking-wider text-text-secondary uppercase">{g.title}</p>}
          <ul className="space-y-0.5">
            {g.items.map((i) => {
              const active = path === i.to || path.startsWith(i.to + '/');
              return (
                <li key={i.to}>
                  <Link
                    to={i.to}
                    onClick={onNavigate}
                    title={collapsed ? i.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'group flex h-9 items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-[13.5px] font-medium transition-colors',
                      active ? 'bg-brand-soft text-brand-hover' : 'text-text-secondary hover:bg-line-subtle hover:text-text-primary',
                      collapsed && 'justify-center',
                    )}
                  >
                    <i.icon className={clsx('size-[18px] shrink-0', active && 'text-brand-primary')} aria-hidden />
                    {!collapsed && <span className="flex-1 truncate">{i.label}</span>}
                    {!collapsed && !!i.badge && i.badge > 0 && (
                      <span className="rounded-full bg-brand-primary px-1.5 text-[11px] font-semibold text-white tabular" aria-label={`${i.badge} need attention`}>
                        {i.badge > 99 ? '99+' : i.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link to="/dashboard" className="flex h-16 items-center gap-2.5 border-b border-line px-4" aria-label="Lokmangal admin home">
      <img src="/emblem.png" alt="" width="32" height="32" className="size-8 shrink-0 object-contain" />
      {!collapsed && (
        <span className="leading-tight">
          <span className="block text-[14px] font-semibold">Lokmangal</span>
          <span className="block text-[11px] text-text-secondary">Admin workspace</span>
        </span>
      )}
    </Link>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ data: Notification[]; meta: { unread: number } }>('/notifications'),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const read = useMutation({ mutationFn: (id: string) => api.post(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const unread = q.data?.meta.unread ?? 0;
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="relative rounded-lg p-2 text-text-secondary hover:bg-line-subtle hover:text-text-primary" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute top-1 right-1 size-2.5 rounded-full bg-brand-primary ring-2 ring-white" aria-hidden />}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="z-50 w-[min(380px,calc(100vw-24px))] rounded-[var(--radius-panel)] border border-line bg-surface shadow-[var(--shadow-menu)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button className="text-[12px] text-brand-primary hover:underline" onClick={() => readAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {(q.data?.data ?? []).length === 0 && <p className="px-4 py-8 text-center text-[13px] text-text-secondary">You're all caught up.</p>}
            {q.data?.data.map((n) => (
              <Dropdown.Item
                key={n.id}
                className={clsx('flex cursor-pointer gap-3 border-b border-line-subtle px-4 py-3 outline-none data-[highlighted]:bg-canvas', !n.read && 'bg-brand-soft/40')}
                onSelect={() => {
                  if (!n.read) read.mutate(n.id);
                  if (n.link) navigate({ to: n.link });
                }}
              >
                <span className={clsx('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-primary')} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{n.title}</span>
                  {n.body && <span className="block truncate text-[12px] text-text-secondary">{n.body}</span>}
                  <span className="block text-[11px] text-text-secondary">{fmtRelative(n.created_at)}</span>
                </span>
              </Dropdown.Item>
            ))}
          </div>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function AccountMenu() {
  const { me } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const initials = me.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-line-subtle" aria-label="Account menu">
        <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand-hover">{initials}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[13px] font-medium">{me.name}</span>
          <span className="block text-[11px] text-text-secondary">{me.roles.map((r) => r.replace('_', ' ')).join(', ')}</span>
        </span>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="z-50 min-w-[220px] rounded-[var(--radius-panel)] border border-line bg-surface p-1 shadow-[var(--shadow-menu)]">
          <div className="px-3 py-2 text-[12px] text-text-secondary">{me.email}</div>
          <Dropdown.Item className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-canvas" onSelect={() => navigate({ to: '/account/security' })}>
            <KeyRound className="size-4" /> Security and sessions
          </Dropdown.Item>
          <Dropdown.Separator className="my-1 h-px bg-line" />
          <Dropdown.Item
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft"
            onSelect={async () => {
              await api.post('/auth/logout').catch(() => {});
              setCsrfToken(null);
              qc.clear();
              navigate({ to: '/login', search: { reason: 'signed_out' } as never });
            }}
          >
            <LogOut className="size-4" /> Sign out
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

type SearchHit = { type: string; title: string; link: string };

/** Ctrl/Cmd+K: jump to a module or a permitted record. */
function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const navigate = useNavigate();
  const groups = useNav();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const hits = useQuery({ queryKey: ['search', debounced], queryFn: () => api.get<Data<SearchHit[]>>(`/search${qs({ q: debounced })}`).then((r) => r.data), enabled: debounced.length >= 2 });
  const modules = useMemo(() => groups.flatMap((g) => g.items).filter((i) => i.label.toLowerCase().includes(q.toLowerCase())), [groups, q]);
  const go = (to: string) => {
    onOpenChange(false);
    setQ('');
    navigate({ to });
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-zinc-950/40" />
        <DialogPrimitive.Content className="fixed top-[12vh] left-1/2 z-50 w-[min(600px,calc(100vw-32px))] -translate-x-1/2 rounded-[var(--radius-panel)] bg-surface shadow-[var(--shadow-menu)]">
          <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search modules, enquiries, content and staff</DialogPrimitive.Description>
          <div className="flex items-center gap-2 border-b border-line px-4">
            <Search className="size-4 text-text-secondary" aria-hidden />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search modules, enquiry references, content, people…" className="h-12 flex-1 bg-transparent text-sm outline-none" aria-label="Search" />
          </div>
          <div className="max-h-[50vh] overflow-y-auto p-2">
            {modules.length > 0 && <p className="px-2 py-1 text-[11px] font-semibold text-text-secondary uppercase">Go to</p>}
            {modules.slice(0, 8).map((m) => (
              <button key={m.to} onClick={() => go(m.to)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-canvas">
                <m.icon className="size-4 text-text-secondary" aria-hidden /> {m.label}
              </button>
            ))}
            {(hits.data ?? []).length > 0 && <p className="mt-2 px-2 py-1 text-[11px] font-semibold text-text-secondary uppercase">Records</p>}
            {hits.data?.map((h) => (
              <button key={h.link} onClick={() => go(h.link)} className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-canvas">
                <span className="truncate">{h.title}</span>
                <span className="text-[11px] text-text-secondary">{h.type.replace('_', ' ')}</span>
              </button>
            ))}
            {debounced.length >= 2 && hits.isSuccess && hits.data.length === 0 && modules.length === 0 && <p className="px-2 py-6 text-center text-[13px] text-text-secondary">No matches for “{debounced}”.</p>}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('lm.sidebar') === 'collapsed';
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem('lm.sidebar', collapsed ? 'collapsed' : 'open');
    } catch {
      /* preference only */
    }
  }, [collapsed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className={clsx('sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-surface transition-[width] lg:flex', collapsed ? 'w-[76px]' : 'w-[248px]')}>
        <Brand collapsed={collapsed} />
        <SidebarNav collapsed={collapsed} />
        <button onClick={() => setCollapsed((c) => !c)} className="flex h-11 items-center gap-2 border-t border-line px-5 text-[13px] text-text-secondary hover:text-text-primary" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-zinc-950/30 lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col bg-surface lg:hidden">
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Main navigation</DialogPrimitive.Description>
            <Brand collapsed={false} />
            <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur md:px-6">
          <button className="rounded-lg p-2 text-text-secondary hover:bg-line-subtle lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <button onClick={() => setSearchOpen(true)} className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-line bg-canvas px-3 text-left text-[13px] text-text-secondary hover:border-zinc-300 sm:max-w-md">
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Search…</span>
            <kbd className="ml-auto hidden rounded border border-line bg-surface px-1.5 text-[11px] sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Notifications />
            <AccountMenu />
          </div>
        </header>
        <main id="content" tabIndex={-1} className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 focus:outline-none md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
