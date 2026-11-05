import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './state/AuthProvider';
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

export function App() {
  const { screen } = useAuth();

  if (screen === 'loading') return <LoadingScreen />;
  if (screen === 'login') return <LoginScreen />;
  if (screen === 'set-password') return <SetPasswordScreen />;

  // The router mounts only once the app is open, so it never competes with the SDK
  // for the hash an invite or recovery link arrives on.
  return (
    <HashRouter>
      <TopbarProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/client/:id" element={<ClientProfilePage />} />
            <Route path="/installs" element={<InstallsPage />} />
            <Route path="/service" element={<ServicePage />} />
            <Route path="/porting" element={<PortingPage />} />
            <Route path="/complaints" element={<ComplaintsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </TopbarProvider>
    </HashRouter>
  );
}
