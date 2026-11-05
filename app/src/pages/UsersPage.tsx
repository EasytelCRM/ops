import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { InviteModal } from '../components/users/InviteModal';
import { useProfiles } from '../hooks/useClients';
import { logAudit } from '../lib/audit';
import type { Profile, Role } from '../lib/db.types';
import { fmtDate, initials } from '../lib/format';
import { isActiveStaff, roleLabel } from '../lib/roles';
import { sb } from '../lib/supabase';
import { useAuth } from '../state/AuthProvider';
import { useModal } from '../state/ModalProvider';
import { useToast } from '../state/ToastProvider';

const ROLE_BADGE: Record<string, string> = { admin: 'badge-blue', ops: 'badge-amber' };
const roleBadge = (role: string | null | undefined) => ROLE_BADGE[role ?? ''] ?? 'badge-gray';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function UserRow({
  p,
  isSelf,
  onRole,
  onActive,
  onRename,
}: {
  p: Profile;
  isSelf: boolean;
  onRole: (role: Role) => void;
  onActive: (makeActive: boolean) => void;
  onRename: (name: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const live = isActiveStaff(p);
  // The status buttons only appear once the database has the account-status column
  const statusReady = 'active' in p;

  const startRename = () => {
    setDraft(p.full_name ?? '');
    setRenaming(true);
  };

  const commit = () => {
    setRenaming(false);
    onRename(draft);
  };

  return (
    <tr className={!live && p.deactivated_at ? 'user-off' : undefined}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
            {initials(p.full_name)}
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {renaming ? (
              <>
                <input
                  className="fi"
                  maxLength={60}
                  autoComplete="off"
                  autoFocus
                  value={draft}
                  style={{ width: 220, padding: '4px 8px', fontSize: 13 }}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commit();
                    } else if (e.key === 'Escape') setRenaming(false);
                  }}
                />
                <button className="btn btn-sm btn-primary" onClick={commit}>
                  <i className="ti ti-check" /> Save
                </button>
                <button className="btn btn-sm" onClick={() => setRenaming(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                {p.full_name}
                <button
                  className="jn-act user-rename"
                  title="Change display name"
                  onClick={startRename}
                >
                  <i className="ti ti-pencil" />
                </button>
              </>
            )}
          </span>{' '}
          {/* Pending: signed up but never approved. Deactivated: switched off by an admin. */}
          {!live &&
            (p.deactivated_at ? (
              <span className="badge badge-red" title={`Deactivated ${fmtDate(p.deactivated_at)}`}>
                Deactivated
              </span>
            ) : (
              <span className="badge badge-amber">Waiting for approval</span>
            ))}
        </div>
      </td>
      <td style={{ color: 'var(--text2)' }}>{p.email}</td>
      <td>
        <span className={`badge ${roleBadge(p.role)}`}>{roleLabel(p.role)}</span>
      </td>
      <td style={{ fontSize: 12, color: 'var(--text2)' }}>{fmtDate(p.created_at)}</td>
      <td>
        {isSelf ? (
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>You</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              className="fi"
              style={{ width: 120, padding: '4px 8px', fontSize: 12 }}
              value={p.role ?? 'technician'}
              onChange={(e) => onRole(e.target.value as Role)}
            >
              <option value="technician">Tech</option>
              <option value="ops">Ops</option>
              <option value="admin">Admin</option>
            </select>
            {statusReady &&
              (live ? (
                <button className="btn btn-sm" onClick={() => onActive(false)}>
                  <i className="ti ti-user-off" /> Deactivate
                </button>
              ) : (
                <button className="btn btn-sm btn-primary" onClick={() => onActive(true)}>
                  <i className="ti ti-user-check" /> {p.deactivated_at ? 'Reactivate' : 'Activate'}
                </button>
              ))}
          </div>
        )}
      </td>
    </tr>
  );
}

export function UsersPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { openModal, closeModal } = useModal();
  const { user, refreshProfile } = useAuth();
  const { data: profiles = [], isLoading } = useProfiles();

  const reload = () => queryClient.invalidateQueries({ queryKey: ['profiles'] });

  const pending = profiles.filter((p) => !isActiveStaff(p) && !p.deactivated_at);
  const active = profiles.filter(isActiveStaff);
  const deactivated = profiles.filter((p) => !isActiveStaff(p) && p.deactivated_at);
  // Headings only once there is more than one group to tell apart
  const grouped = !!pending.length || !!deactivated.length;

  /** Through set_display_name(), which only admins may call and which changes nothing but the name. */
  const rename = async (p: Profile, raw: string) => {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) {
      toast('Enter a name', 'warn');
      return;
    }
    if (name === p.full_name) return;
    try {
      const { error } = await sb.rpc('set_display_name', { target: p.id, new_name: name });
      if (error) throw error;
      if (p.id === user?.id) await refreshProfile();
      toast('Name updated');
      void reload();
    } catch (e) {
      toast(`Name not changed: ${(e as Error).message}`, 'error');
    }
  };

  /**
   * Activate, reactivate or deactivate via set_user_active(), which also blocks or unblocks
   * sign-in, signs a deactivated user out everywhere, unassigns their open work and writes
   * the audit entry.
   */
  const setActive = async (p: Profile, makeActive: boolean) => {
    const name = p.full_name || p.email || 'this user';
    if (
      !makeActive &&
      !confirm(
        `Deactivate ${name}?\n\nThey'll be signed out on every device and won't be able to log back in. Their open jobs and complaints will become Unassigned. Everything they've logged stays as it is.`,
      )
    )
      return;
    try {
      const { data, error } = await sb.rpc('set_user_active', {
        target: p.id,
        make_active: makeActive,
      });
      if (error) throw error;
      if (makeActive) toast(`${name} activated`);
      else {
        const freed = [
          data?.jobs_unassigned ? plural(data.jobs_unassigned, 'job') : '',
          data?.complaints_unassigned ? plural(data.complaints_unassigned, 'complaint') : '',
        ].filter(Boolean);
        toast(`${name} deactivated${freed.length ? ` · ${freed.join(' and ')} unassigned` : ''}`);
      }
      void reload();
    } catch (e) {
      toast(`Failed: ${(e as Error).message}`, 'error');
    }
  };

  const setRole = async (p: Profile, role: Role) => {
    try {
      const { error } = await sb.from('profiles').update({ role }).eq('id', p.id);
      if (error) throw error;
      await logAudit('updated', 'profiles', p.id, {}, { role });
      toast('Role updated');
      void reload();
    } catch (e) {
      toast(`Failed: ${(e as Error).message}`, 'error');
    }
  };

  const row = (p: Profile) => (
    <UserRow
      key={p.id}
      p={p}
      isSelf={p.id === user?.id}
      onRole={(role) => void setRole(p, role)}
      onActive={(makeActive) => void setActive(p, makeActive)}
      onRename={(name) => void rename(p, name)}
    />
  );

  const section = (label: string, list: Profile[]) =>
    !list.length ? null : (
      <>
        {grouped && (
          <tr className="users-sec">
            <td colSpan={5}>
              {label} ({list.length})
            </td>
          </tr>
        )}
        {list.map(row)}
      </>
    );

  return (
    <div className="page active" id="page-users">
      <div className="card">
        <div className="card-head">
          <h3>Team members</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              openModal(<InviteModal onClose={closeModal} onInvited={() => void reload()} />)
            }
          >
            <i className="ti ti-user-plus" /> Invite user
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody id="users-tbody">
              {section('Waiting for approval', pending)}
              {section('Active', active)}
              {section('Deactivated', deactivated)}
              {!profiles.length && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      <i className="ti ti-users" />
                      <p>{isLoading ? 'Loading…' : 'No team members found.'}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
