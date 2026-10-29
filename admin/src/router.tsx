// Routes (specification §5). Screens are loaded on demand; the shell and session wrap every staff route.

import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Link, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from './components/shell';
import { EmptyState } from './components/ui';
import { SessionProvider } from './lib/session';

/** Keeps filters in the URL so views can be bookmarked; values stay strings. */
const looseSearch = (s: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(s).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).map(([k, v]) => [k, String(v)])) as Record<string, string>;

function NotFound() {
  return (
    <EmptyState title="Page not found" action={<Link to="/dashboard" className="text-brand-primary underline">Go to the dashboard</Link>}>
      The address may be mistyped, or the page has moved.
    </EmptyState>
  );
}

const rootRoute = createRootRoute({ component: () => <Outlet />, notFoundComponent: NotFound });

const page = (file: () => Promise<Record<string, unknown>>, name: string) => lazyRouteComponent(file as never, name as never);
const auth = () => import('./features/auth');
const dashboard = () => import('./features/dashboard');
const leads = () => import('./features/leads');
const careers = () => import('./features/careers');
const content = () => import('./features/content');
const rates = () => import('./features/rates');
const approvals = () => import('./features/approvals');
const publish = () => import('./features/publish');
const media = () => import('./features/media');
const users = () => import('./features/users');
const audit = () => import('./features/audit');
const settings = () => import('./features/settings');
const account = () => import('./features/account');

const publicRoute = <P extends string>(path: P, file: () => Promise<Record<string, unknown>>, name: string) =>
  createRoute({ getParentRoute: () => rootRoute, path, component: page(file, name), validateSearch: looseSearch });

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  component: () => (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' });
  },
});

const r = <P extends string>(path: P, file: () => Promise<Record<string, unknown>>, name: string) =>
  createRoute({ getParentRoute: () => appRoute, path, component: page(file, name), validateSearch: looseSearch });

const routeTree = rootRoute.addChildren([
  indexRoute,
  publicRoute('/login', auth, 'LoginPage'),
  publicRoute('/reset-password', auth, 'ResetPasswordPage'),
  publicRoute('/accept-invitation', auth, 'AcceptInvitationPage'),
  appRoute.addChildren([
    r('/dashboard', dashboard, 'DashboardPage'),
    r('/leads', leads, 'LeadsPage'),
    r('/leads/$id', leads, 'LeadDetailPage'),
    r('/careers/applications', careers, 'ApplicationsPage'),
    r('/careers/applications/$id', careers, 'ApplicationDetailPage'),
    r('/careers/jobs', content, 'JobsPage'),
    r('/products/rates', rates, 'RateSetsPage'),
    r('/products/rates/$id', rates, 'RateSetPage'),
    r('/products/deposits', content, 'DepositsPage'),
    r('/products/loans', content, 'LoansPage'),
    r('/website/homepage', content, 'HomepagePage'),
    r('/website/pages', content, 'PagesHubPage'),
    r('/website/posts', content, 'PostsPage'),
    r('/website/gallery', content, 'GalleryPage'),
    r('/website/notices', content, 'NoticesPage'),
    r('/website/branches', content, 'BranchesPage'),
    r('/website/media', media, 'MediaPage'),
    r('/website/navigation', content, 'NavigationPage'),
    r('/website/redirects', content, 'RedirectsPage'),
    r('/content/$collection', content, 'CollectionRoutePage'),
    r('/content/$collection/$id', content, 'ContentEditorPage'),
    r('/approvals', approvals, 'ApprovalsPage'),
    r('/approvals/$id', approvals, 'ApprovalPage'),
    r('/publish', publish, 'PublishPage'),
    r('/publish/releases/$id', publish, 'ReleasePage'),
    r('/admin/users', users, 'UsersPage'),
    r('/admin/users/$id', users, 'UserPage'),
    r('/admin/roles', users, 'RolesPage'),
    r('/admin/audit', audit, 'AuditPage'),
    r('/admin/settings', settings, 'SettingsPage'),
    r('/account/security', account, 'AccountSecurityPage'),
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
