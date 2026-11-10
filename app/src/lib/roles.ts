import type { Profile } from './db.types';

export const isAdmin = (p: Profile | null) => p?.role === 'admin';
export const isOps = (p: Profile | null) => p?.role === 'ops';
export const isAdminOrOps = (p: Profile | null) => isAdmin(p) || isOps(p);
/** A TV login: the database refuses it everything but the call stats, and the app shows only the wallboard. */
export const isWallboard = (p: Profile | null) => p?.role === 'wallboard';

/** Only `active === false` locks an account out; a missing key means the column predates the row. */
export const isActiveStaff = (p: Pick<Profile, 'active'> | null | undefined) => p?.active !== false;

export const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  ops: 'Ops',
  technician: 'Tech',
  wallboard: 'Wallboard',
};

export const roleLabel = (role: string | null | undefined) => ROLE_LABEL[role ?? ''] ?? 'Tech';
