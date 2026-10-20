import React, { useEffect, useState } from 'react';
import { RoleProvider, useRole } from './context/RoleContext';
import { NotificationProvider } from './context/NotificationContext';
import { DataProvider } from './context/DataContext';
import { AccessProvider, useAccess } from './context/AccessContext';
import { SettingsProvider } from './context/SettingsContext';
import { ToastContainer } from './components/common/UIComponents';
import { NoAccess, PageErrorBoundary } from './components/common/StateViews';

import { LoginPage } from './components/auth/LoginPage';
import { SetPasswordPage } from './components/auth/SetPasswordPage';
import { ChangePasswordPage } from './components/auth/ChangePasswordPage';

import { AdminLayout } from './components/layout/AdminLayout';

import { AdminDashboardView } from './components/admin/Dashboard/AdminDashboardView';
import { POTrackerMain } from './components/admin/POTracker/POTrackerMain';
import { ProjectsView } from './components/admin/Projects/ProjectsView';
import { InvoicesView } from './components/admin/Invoices/InvoicesView';
import { ProformaInvoicesView } from './components/admin/ProformaInvoices/ProformaInvoicesView';
import { DocumentsView } from './components/admin/Documents/DocumentsView';
import { AssignmentsView } from './components/admin/Assignments/AssignmentsView';
import { UsersRolesView } from './components/admin/UsersRoles/UsersRolesView';
import { NotificationsView } from './components/admin/Notifications/NotificationsView';
import { DataImportView } from './components/admin/DataImport/DataImportView';
import { AlertSettingsView } from './components/admin/AlertSettings/AlertSettingsView';

import { AppUser } from './types/access';
import { AppTab, canOpenTab, normalizeTab } from './lib/navAccess';
import { parseLocation, buildUrl, NavParams } from './lib/routes';

// Links from emails arrive as ?invite=<token> or ?reset=<token>.
function readLinkToken(): { mode: 'invite' | 'reset'; token: string } | null {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get('invite');
  if (invite) return { mode: 'invite', token: invite };
  const reset = params.get('reset');
  if (reset) return { mode: 'reset', token: reset };
  return null;
}

function clearLinkToken() {
  window.history.replaceState(null, '', window.location.pathname);
}

export function AppContent() {
  const { loginAs, currentAppUser, can } = useRole();
  const { mode, session, restoring, signOut } = useAccess();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Initialize route from window location
  const initialRoute = parseLocation(window.location.pathname, window.location.search);
  const [currentTab, setCurrentTab] = useState<AppTab>(initialRoute.tab);
  const [navigationParams, setNavigationParams] = useState<NavParams>(initialRoute.params);
  const [linkToken, setLinkToken] = useState(readLinkToken);
  const [changingPassword, setChangingPassword] = useState(false);

  // Sync state when browser back/forward or manual location change occurs
  useEffect(() => {
    const handlePopState = () => {
      const route = parseLocation(window.location.pathname, window.location.search);
      setCurrentTab(route.tab);
      setNavigationParams(route.params);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (tabInput: string, params?: NavParams | null) => {
    const normalized = normalizeTab(tabInput);
    const navParams = params || {};
    setCurrentTab(normalized);
    setNavigationParams(navParams);

    const newUrl = buildUrl(normalized, navParams);
    if (window.location.pathname + window.location.search !== newUrl) {
      window.history.pushState({ tab: normalized, params: navParams }, '', newUrl);
    }
  };

  const handleSignOut = () => {
    setIsAuthenticated(false);
    setChangingPassword(false);
    void signOut();
  };

  // With the backend, the server's session decides who is signed in: a saved session is picked up after a reload,
  // and a session the server ended (disabled user, role change, expired) sends the person back to the sign-in page.
  useEffect(() => {
    if (mode !== 'api') return;
    if (session && !isAuthenticated) {
      loginAs(session.user);
      setIsAuthenticated(true);
    } else if (!session && isAuthenticated) {
      setIsAuthenticated(false);
      setChangingPassword(false);
    }
  }, [mode, session, isAuthenticated, loginAs]);

  // Waiting for a saved session to be checked, so the sign-in page does not flash first.
  if (mode === 'api' && restoring) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 text-sm" role="status">
        Signing you in…
      </div>
    );
  }

  // 1. SET PASSWORD FROM AN INVITE OR RESET LINK
  if (linkToken) {
    return (
      <SetPasswordPage
        mode={linkToken.mode}
        token={linkToken.token}
        onDone={() => {
          clearLinkToken();
          setLinkToken(null);
        }}
      />
    );
  }

  // 2. LOGIN SCREEN
  if (!isAuthenticated) {
    return (
      <LoginPage
        onLoginSuccess={(user: AppUser) => {
          loginAs(user);
          setIsAuthenticated(true);
          handleNavigate('dashboard');
        }}
      />
    );
  }

  // 3. PASSWORD CHANGE (forced by an admin, or chosen from the profile menu)
  if (currentAppUser.mustChangePassword || changingPassword) {
    const forced = !!currentAppUser.mustChangePassword;
    return (
      <ChangePasswordPage
        forced={forced}
        onDone={() => setChangingPassword(false)}
        onCancel={forced ? handleSignOut : () => setChangingPassword(false)}
      />
    );
  }

  // 4. PO MANAGEMENT APP. Pages without permission show "No access", even via links.
  const activeTab = normalizeTab(currentTab);
  const allowed = canOpenTab(activeTab, can);

  return (
    <AdminLayout
      currentTab={activeTab}
      onNavigate={handleNavigate}
      onSignOut={handleSignOut}
      onChangePassword={() => setChangingPassword(true)}
    >
      <PageErrorBoundary resetKey={activeTab}>
        {!allowed && <NoAccess onBack={() => handleNavigate('dashboard')} />}
        {allowed && activeTab === 'dashboard' && <AdminDashboardView onNavigate={handleNavigate} />}
        {allowed && activeTab === 'pos' && (
          <POTrackerMain
            onNavigate={handleNavigate}
            initialStatusFilter={navigationParams?.statusFilter}
            initialProjectFilter={navigationParams?.projectFilter}
            initialSearch={navigationParams?.search || navigationParams?.q}
            initialExpiryFilter={navigationParams?.expiryFilter}
            selectedPoId={navigationParams?.poId}
            highlightEmployeeId={navigationParams?.highlightEmployeeId}
            initialTab={navigationParams?.initialTab}
            returnTo={navigationParams?.returnTo}
            returnParams={navigationParams}
          />
        )}
        {allowed && activeTab === 'projects' && (
          <ProjectsView
            onNavigate={handleNavigate}
            initialStatusFilter={navigationParams?.statusFilter}
            initialSearch={navigationParams?.search || navigationParams?.q}
            returnTo={navigationParams?.returnTo}
          />
        )}
        {allowed && activeTab === 'invoices' && (
          <InvoicesView
            onNavigate={handleNavigate}
            initialSearch={navigationParams?.search || navigationParams?.q}
            initialProjectFilter={navigationParams?.projectFilter}
            initialTypeFilter={navigationParams?.typeFilter}
            initialStatusFilter={navigationParams?.statusFilter}
            initialMonthFilter={navigationParams?.monthFilter}
            returnTo={navigationParams?.returnTo}
          />
        )}
        {allowed && activeTab === 'proformas' && (
          <ProformaInvoicesView
            onNavigate={handleNavigate}
            initialPoId={navigationParams?.poId}
            highlightEmployeeId={navigationParams?.highlightEmployeeId}
            initialSearch={navigationParams?.search || navigationParams?.q}
            returnTo={navigationParams?.returnTo}
          />
        )}
        {allowed && activeTab === 'documents' && (
          <DocumentsView
            onNavigate={handleNavigate}
            initialTypeFilter={navigationParams?.typeFilter}
            initialStatusFilter={navigationParams?.statusFilter}
          />
        )}
        {allowed && activeTab === 'assignments' && <AssignmentsView />}
        {allowed && activeTab === 'notifications' && (
          <NotificationsView
            onNavigate={handleNavigate}
            initialTypeFilter={navigationParams?.typeFilter as any}
            initialUnreadOnly={navigationParams?.unreadOnly === 'true'}
            initialScope={navigationParams?.scope as any}
            returnTo={navigationParams?.returnTo}
          />
        )}
        {allowed && activeTab === 'import' && <DataImportView />}
        {allowed && activeTab === 'alert-settings' && <AlertSettingsView />}
        {allowed && activeTab === 'users-roles' && <UsersRolesView />}
      </PageErrorBoundary>
    </AdminLayout>
  );
}

export default function App() {
  return (
    <NotificationProvider>
      <AccessProvider>
        <RoleProvider>
          <DataProvider>
            <SettingsProvider>
              <AppContent />
              <ToastContainer />
            </SettingsProvider>
          </DataProvider>
        </RoleProvider>
      </AccessProvider>
    </NotificationProvider>
  );
}
