import { useCallback, useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { UpdateBar } from './UpdateBar';
import { useUpdateCheck } from '../../hooks/useUpdateCheck';
import { paneHasUnsavedWork } from '../../lib/jobPanes';
import { portingHasUnsavedWork } from '../../lib/portingPane';
import { complaintHasUnsavedWork } from '../../lib/complaintPane';
import { registerUnsavedCheck } from '../../lib/unsavedWork';

export function AppShell() {
  // Registered here, not on the pages themselves: a draft left open on New Installs,
  // Porting or Complaints must still stop an automatic reload while the user is off
  // looking at a client.
  useEffect(() => registerUnsavedCheck(paneHasUnsavedWork), []);
  useEffect(() => registerUnsavedCheck(portingHasUnsavedWork), []);
  useEffect(() => registerUnsavedCheck(complaintHasUnsavedWork), []);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return !!localStorage.getItem('navCollapsed');
    } catch {
      return false;
    }
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { newVersion, reloadForUpdate } = useUpdateCheck(true);

  const toggleNav = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem('navCollapsed', next ? '1' : '');
      } catch {
        /* private window: the toggle still works, it just will not be remembered */
      }
      return next;
    });
  }, []);

  return (
    <>
      <div
        className={`sidebar-backdrop${sidebarOpen ? ' visible' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
      <div className={`app${collapsed ? ' nav-collapsed' : ''}`}>
        <Sidebar open={sidebarOpen} onNavigate={() => setSidebarOpen(false)} />
        <div className="main">
          <Topbar onOpenSidebar={() => setSidebarOpen(true)} onToggleNav={toggleNav} />
          <div className="content">
            <Outlet />
          </div>
        </div>
      </div>
      {newVersion && <UpdateBar onReload={reloadForUpdate} />}
    </>
  );
}
