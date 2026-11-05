import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { titleFor } from '../../nav';
import { useDarkMode } from '../../hooks/useDarkMode';
import { useSync } from '../../state/SyncProvider';
import { useTopbar } from '../../state/TopbarProvider';

export function Topbar({ onOpenSidebar, onToggleNav }: { onOpenSidebar: () => void; onToggleNav: () => void }) {
  const { pathname } = useLocation();
  const { dark, toggle } = useDarkMode();
  const { status, retry } = useSync();
  const { cta } = useTopbar();
  const queryClient = useQueryClient();

  const syncTitle =
    status === 'syncing' ? 'Syncing…' : status === 'error' ? 'Connection lost — click to retry' : 'Synced';

  return (
    <div className="topbar">
      <button className="topbar-menu" onClick={onOpenSidebar}>
        <i className="ti ti-menu-2" />
      </button>
      <button className="nav-toggle" onClick={onToggleNav} title="Toggle navigation">
        <i className="ti ti-layout-sidebar" />
      </button>
      <h2>{titleFor(pathname)}</h2>
      <div className="topbar-actions">
        <span
          style={{
            fontSize: 9,
            color: 'var(--text3)',
            fontFamily: "'DM Sans', system-ui, sans-serif",
            cursor: 'default',
          }}
          onClick={() => window.location.reload()}
        >
          {__APP_VERSION__}
        </span>
        <div
          className={`sync-dot${status === 'syncing' ? ' syncing' : status === 'error' ? ' error' : ''}`}
          title={syncTitle}
          style={{ cursor: status === 'error' ? 'pointer' : 'default' }}
          onClick={status === 'error' ? retry : undefined}
        />
        <button className="dark-toggle" onClick={toggle} title="Toggle dark mode">
          <i className={`ti ${dark ? 'ti-sun' : 'ti-moon'}`} />
        </button>
        <button className="btn btn-sm" onClick={() => void queryClient.refetchQueries({ type: 'active' })}>
          <i className="ti ti-refresh" />
        </button>
        {cta}
      </div>
    </div>
  );
}
