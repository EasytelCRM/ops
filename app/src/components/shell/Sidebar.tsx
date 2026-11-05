import { Fragment } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../state/AuthProvider';
import { NAV } from '../../nav';
import { initials } from '../../lib/format';
import { roleLabel } from '../../lib/roles';

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { profile, user, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const visible = NAV.filter((n) => !n.visible || n.visible(profile));

  // Kept as divs, not <a>: the stylesheet has no anchor reset, so links would
  // pick up the browser's underline and the sidebar would stop matching.
  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`);

  const go = (path: string) => {
    navigate(path);
    onNavigate();
  };

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="logo">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Easytel" style={{ height: 24, width: 'auto' }} />
        <div>
          <h1>Easytel CRM</h1>
          <p>Operations</p>
        </div>
      </div>
      <nav>
        {visible.map((item) => (
          <Fragment key={item.path}>
            {item.group && <div className="nav-label">{item.group}</div>}
            <div
              className={`nav-item${isActive(item.path) ? ' active' : ''}`}
              data-page={item.path}
              onClick={() => go(item.path)}
            >
              <i className={`ti ${item.icon}`} /> {item.label}
            </div>
          </Fragment>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="user-chip">
          <div className="user-avatar">{initials(profile?.full_name || user?.email)}</div>
          <div className="user-info">
            <div className="user-name">{profile?.full_name || user?.email || 'Loading...'}</div>
            <div className="user-role">{roleLabel(profile?.role)}</div>
          </div>
          <button
            className="btn-icon btn"
            onClick={() => void signOut()}
            title="Sign out"
            style={{ border: 'none', background: 'none', color: 'var(--text3)' }}
          >
            <i className="ti ti-logout" style={{ fontSize: 16 }} />
          </button>
        </div>
      </div>
    </aside>
  );
}
