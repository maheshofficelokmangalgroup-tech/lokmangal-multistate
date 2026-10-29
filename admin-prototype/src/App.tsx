import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { LoginScreen } from './features/auth/LoginScreen';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { LeadsScreen } from './features/leads/LeadsScreen';
import { RatesScreen } from './features/rates/RatesScreen';
import { DepositsScreen } from './features/deposits/DepositsScreen';
import { LoansScreen } from './features/loans/LoansScreen';
import { BranchesScreen } from './features/website/BranchesScreen';
import { PostsScreen } from './features/website/PostsScreen';
import { NoticesScreen } from './features/website/NoticesScreen';
import { HomepageScreen } from './features/website/HomepageScreen';
import { MediaScreen } from './features/website/MediaScreen';
import { ApprovalsScreen } from './features/approvals/ApprovalsScreen';
import { PublishScreen } from './features/publish/PublishScreen';
import { UsersScreen } from './features/admin/UsersScreen';
import { AuditScreen } from './features/admin/AuditScreen';
import { SettingsScreen } from './features/admin/SettingsScreen';
import { CareersScreen } from './features/careers/CareersScreen';
import { PagesScreen } from './features/website/PagesScreen';
import { GalleryScreen } from './features/website/GalleryScreen';
import { NavigationScreen } from './features/website/NavigationScreen';

export const App: React.FC = () => {
  const { isAuthenticated, requires2FA } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<string>('dashboard');

  if (!isAuthenticated || requires2FA) {
    return <LoginScreen />;
  }

  const routeTitles: Record<string, string> = {
    dashboard: 'Dashboard Overview',
    leads: 'Leads & Enquiries',
    careers: 'Careers & Hiring',
    rates: 'Interest Rates (व्याजदर)',
    deposits: 'Deposit Schemes',
    loans: 'Loan Products',
    homepage: 'Homepage & Hero',
    pages: 'Pages & People',
    posts: 'Blog & News Articles',
    gallery: 'Photo Gallery',
    notices: 'Notices & Reports',
    branches: 'Branch Network (६०+)',
    media: 'Media Library',
    navigation: 'Navigation & SEO',
    approvals: 'Maker–Checker Approvals',
    publish: 'Publish Center & Rollback',
    users: 'Users & Roles',
    audit: 'Immutable Audit Trail',
    settings: 'Organisation Settings',
  };

  const renderCurrentScreen = () => {
    switch (currentRoute) {
      case 'dashboard':
        return <DashboardScreen onNavigate={(r) => setCurrentRoute(r)} />;
      case 'leads':
        return <LeadsScreen />;
      case 'careers':
        return <CareersScreen />;
      case 'rates':
        return <RatesScreen onNavigateToApprovals={() => setCurrentRoute('approvals')} />;
      case 'deposits':
        return <DepositsScreen />;
      case 'loans':
        return <LoansScreen />;
      case 'branches':
        return <BranchesScreen />;
      case 'posts':
        return <PostsScreen />;
      case 'notices':
        return <NoticesScreen />;
      case 'homepage':
        return <HomepageScreen />;
      case 'media':
        return <MediaScreen />;
      case 'approvals':
        return <ApprovalsScreen />;
      case 'publish':
        return <PublishScreen />;
      case 'users':
        return <UsersScreen />;
      case 'audit':
        return <AuditScreen />;
      case 'settings':
        return <SettingsScreen />;
      case 'pages':
        return <PagesScreen />;
      case 'gallery':
        return <GalleryScreen />;
      case 'navigation':
        return <NavigationScreen />;
      default:
        return <DashboardScreen onNavigate={(r) => setCurrentRoute(r)} />;
    }
  };

  return (
    <AppShell
      currentRoute={currentRoute}
      currentRouteTitle={routeTitles[currentRoute] || 'Dashboard'}
      onNavigate={(r) => setCurrentRoute(r)}
      pendingApprovalsCount={2}
      newLeadsCount={4}
      openApplicationsCount={3}
    >
      {renderCurrentScreen()}
    </AppShell>
  );
};
