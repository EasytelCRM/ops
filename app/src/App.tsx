import type { ReactNode } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { NAV } from './nav';
import { useAuth } from './state/AuthProvider';
import { ModalProvider } from './state/ModalProvider';
import { TopbarProvider } from './state/TopbarProvider';
import { LoadingScreen } from './components/auth/LoadingScreen';
import { LoginScreen } from './components/auth/LoginScreen';
import { SetPasswordScreen } from './components/auth/SetPasswordScreen';
import { AppShell } from './components/shell/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { ClientsPage } from './pages/ClientsPage';
import { ClientProfilePage } from './pages/ClientProfilePage';
import { InstallsPage } from './pages/InstallsPage';
import { ServicePage } from './pages/ServicePage';
import { PortingPage } from './pages/PortingPage';
import { ComplaintsPage } from './pages/ComplaintsPage';
import { UsersPage } from './pages/UsersPage';
import { AuditPage } from './pages/AuditPage';

/**
 * Keeps a role off a page it cannot see in the sidebar. The single-file app had no URL
 * routing, so hiding the nav item was enough to make the page unreachable; with hash
 * routes anyone could type #/users and get it. The rule comes from the nav entry's own
 * `visible`, so the sidebar and the router can never disagree about who gets in.
 *
 * This is a UI guard, not a security boundary — every table is "allow all authenticated",
 * so the data is still reachable through the API by anyone signed in.
 */
function Guarded({ path, children }: { path: string; children: ReactNode }) {
  const { profile } = useAuth();
  const allowed = NAV.find((n) => n.path === path)?.visible?.(profile) ?? true;
  return allowed ? <>{children}</> : <Navigate to="/" replace />;
}

export function App() {
  const { screen } = useAuth();

  if (screen === 'loading') return <LoadingScreen />;
  if (screen === 'login') return <LoginScreen />;
  if (screen === 'set-password') return <SetPasswordScreen />;

  // The router mounts only once the app is open, so it never competes with the SDK
  // for the hash an invite or recovery link arrives on.
  return (
    <HashRouter>
      <ModalProvider>
        <TopbarProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/client/:id" element={<ClientProfilePage />} />
              <Route path="/installs" element={<InstallsPage />} />
              <Route path="/service" element={<ServicePage />} />
              <Route path="/porting" element={<PortingPage />} />
              <Route
                path="/complaints"
                element={
                  <Guarded path="/complaints">
                    <ComplaintsPage />
                  </Guarded>
                }
              />
              <Route
                path="/users"
                element={
                  <Guarded path="/users">
                    <UsersPage />
                  </Guarded>
                }
              />
              <Route
                path="/audit"
                element={
                  <Guarded path="/audit">
                    <AuditPage />
                  </Guarded>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </TopbarProvider>
      </ModalProvider>
    </HashRouter>
  );
}
