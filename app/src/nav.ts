import type { Profile } from './lib/db.types';
import { isAdmin, isAdminOrOps } from './lib/roles';

export interface NavItem {
  /** Router path. */
  path: string;
  /** Sidebar label. */
  label: string;
  /** Tabler icon class, e.g. "ti-users". */
  icon: string;
  /** Topbar heading — not always the same as the sidebar label. */
  title: string;
  /** Sidebar group heading rendered above this item. */
  group?: string;
  /** Hidden from the sidebar when this returns false. */
  visible?: (p: Profile | null) => boolean;
}

/** Order, labels, icons and topbar titles exactly as the single-file app had them. */
export const NAV: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'ti-layout-dashboard', title: 'Dashboard', group: 'Main' },
  { path: '/clients', label: 'Clients', icon: 'ti-users', title: 'Clients' },
  { path: '/installs', label: 'New Installs', icon: 'ti-tool', title: 'New Installs' },
  { path: '/service', label: 'Service Tickets', icon: 'ti-headset', title: 'Service Tickets' },
  { path: '/porting', label: 'Porting', icon: 'ti-phone-outgoing', title: 'Porting' },
  {
    path: '/complaints',
    label: 'Complaints',
    icon: 'ti-message-report',
    title: 'Complaints',
    visible: isAdminOrOps,
  },
  {
    path: '/call-stats',
    label: 'Call Stats',
    icon: 'ti-chart-bar',
    title: 'Sales call stats',
    visible: isAdmin,
  },
  {
    path: '/users',
    label: 'Users',
    icon: 'ti-shield-lock',
    title: 'Team members',
    group: 'Admin',
    visible: isAdmin,
  },
  { path: '/audit', label: 'Audit Log', icon: 'ti-history', title: 'Audit log', visible: isAdmin },
];

/** Topbar heading for a path, including the routes that have no sidebar entry. */
export function titleFor(pathname: string): string {
  if (pathname.startsWith('/client/')) return 'Client profile';
  return NAV.find((n) => n.path === pathname)?.title ?? 'Dashboard';
}
