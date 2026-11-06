import { Fragment, useEffect, useRef, useState } from 'react';
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

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fullName = profile?.full_name || user?.email || 'Loading...';
  // A name saved as an email shows just the part before the @ in the chip
  const shortName = fullName.includes('@') ? fullName.split('@')[0] : fullName;

  // Close the user menu on a click outside it or on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

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
      {/* The chip opens a small menu above it with the full name and Sign out, so the
          narrow sidebar doesn't have to fit a sign-out button beside the name. */}
      <div className="sidebar-footer" ref={menuRef} style={{ position: 'relative' }}>
        {menuOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '0.75rem',
              right: '0.75rem',
              marginBottom: 4,
              background: 'var(--surface)',
              border: '1px solid var(--border2)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              padding: 4,
              zIndex: 10,
            }}
          >
            <div style={{ padding: '6px 8px 8px', fontSize: 12, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
              <div style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{fullName}</div>
              {user?.email && user.email !== fullName && (
                <div style={{ fontSize: 11, color: 'var(--text2)', overflowWrap: 'anywhere' }}>{user.email}</div>
              )}
              <div className="user-role">{roleLabel(profile?.role)}</div>
            </div>
            <div
              className="nav-item"
              role="menuitem"
              tabIndex={0}
              onClick={() => {
                setMenuOpen(false);
                void signOut();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMenuOpen(false);
                  void signOut();
                }
              }}
            >
              <i className="ti ti-logout" /> Sign out
            </div>
          </div>
        )}
        <div
          className="user-chip"
          role="button"
          tabIndex={0}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={fullName}
          onClick={() => setMenuOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setMenuOpen((o) => !o);
            }
          }}
          style={{ cursor: 'pointer', background: menuOpen ? 'var(--bg)' : undefined }}
        >
          <div className="user-avatar">{initials(profile?.full_name || user?.email)}</div>
          <div className="user-info">
            <div className="user-name">{shortName}</div>
            <div className="user-role">{roleLabel(profile?.role)}</div>
          </div>
          <i
            className={`ti ${menuOpen ? 'ti-chevron-down' : 'ti-chevron-up'}`}
            style={{ fontSize: 14, color: 'var(--text3)', flexShrink: 0 }}
          />
        </div>
      </div>
    </aside>
  );
}
