import { useState } from 'react';
import { useRenameWebexUser, useSetSales, useWebexUsers } from '../../hooks/useCallStats';
import { useProfiles } from '../../hooks/useClients';
import type { WebexUser } from '../../lib/db.types';
import { useModal } from '../../state/ModalProvider';
import { useToast } from '../../state/ToastProvider';

/**
 * Who appears on the sales call stats, and under what name. Lists everyone known on Webex;
 * ticking someone saves straight away. Someone with a CRM login shows their CRM name (change
 * it on the Users page); anyone else shows a name copied from Webex, renamed here.
 * Someone new in Webex needs adding to webex_users first.
 */
export function ManageTeamModal() {
  const { closeModal } = useModal();
  const toast = useToast();
  const { data: users = [], isLoading } = useWebexUsers(true);
  const { data: profiles = [] } = useProfiles();
  const setSales = useSetSales();
  const rename = useRenameWebexUser();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const crmName = (u: WebexUser) => (u.profile_id ? profiles.find((p) => p.id === u.profile_id)?.full_name : null);
  const nameOf = (u: WebexUser) => crmName(u) ?? u.label ?? 'Unnamed Webex user';

  const shown = users
    .filter((u) => nameOf(u).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.sales) - Number(a.sales) || nameOf(a).localeCompare(nameOf(b)));

  const toggle = (id: string, sales: boolean) =>
    setSales.mutate({ id, sales }, { onError: (e) => toast(`Couldn't save: ${(e as Error).message}`, 'error') });

  const startEdit = (u: WebexUser) => {
    setDraft(u.label ?? '');
    setEditing(u.webex_person_id);
  };

  const saveName = (u: WebexUser) => {
    const label = draft.trim().replace(/\s+/g, ' ');
    setEditing(null);
    if (!label || label === u.label) return;
    rename.mutate(
      { id: u.webex_person_id, label },
      {
        onSuccess: () => toast('Name updated'),
        onError: (e) => toast(`Couldn't rename: ${(e as Error).message}`, 'error'),
      },
    );
  };

  return (
    <div className="modal" style={{ width: 460 }}>
      <div className="modal-hdr">
        <h3>Sales team</h3>
        <button className="modal-x" onClick={closeModal}>
          <i className="ti ti-x" />
        </button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
        Ticked people appear on the call stats and the wallboard. Changes save straight away.
      </p>
      <input className="fi" placeholder="Search Webex users..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: 10 }}>
        {isLoading ? (
          <div className="empty">
            <i className="ti ti-refresh" />
            <p>Loading...</p>
          </div>
        ) : (
          shown.map((u) => {
            const linked = crmName(u) != null;
            return (
              <div
                key={u.webex_person_id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 2px', fontSize: 13, minHeight: 36 }}
              >
                <input
                  type="checkbox"
                  checked={u.sales}
                  disabled={setSales.isPending}
                  aria-label={`On the sales team: ${nameOf(u)}`}
                  onChange={(e) => toggle(u.webex_person_id, e.target.checked)}
                />
                {editing === u.webex_person_id ? (
                  <>
                    <input
                      className="fi"
                      maxLength={60}
                      autoComplete="off"
                      autoFocus
                      value={draft}
                      style={{ flex: 1, padding: '4px 8px', fontSize: 13 }}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          saveName(u);
                        } else if (e.key === 'Escape') {
                          e.stopPropagation();
                          setEditing(null);
                        }
                      }}
                    />
                    <button className="btn btn-sm btn-primary" onClick={() => saveName(u)}>
                      <i className="ti ti-check" /> Save
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1 }}>{nameOf(u)}</span>
                    {linked ? (
                      <span style={{ fontSize: 11, color: 'var(--text3)' }} title="Change it on the Users page">
                        CRM name
                      </span>
                    ) : (
                      // jn-act hides itself outside a note row, so it is made visible here
                      <button className="jn-act" style={{ opacity: 1 }} title="Rename" onClick={() => startEdit(u)}>
                        <i className="ti ti-pencil" />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="modal-ftr">
        <button className="btn btn-primary" onClick={closeModal}>
          Done
        </button>
      </div>
    </div>
  );
}
