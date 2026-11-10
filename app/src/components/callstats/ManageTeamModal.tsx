import { useState } from 'react';
import { useSetSales, useWebexUsers } from '../../hooks/useCallStats';
import { useModal } from '../../state/ModalProvider';
import { useToast } from '../../state/ToastProvider';

/**
 * Who appears on the sales call stats. Lists everyone known on Webex; ticking someone
 * saves straight away. Someone new in Webex needs adding to webex_users first.
 */
export function ManageTeamModal() {
  const { closeModal } = useModal();
  const toast = useToast();
  const { data: users = [], isLoading } = useWebexUsers(true);
  const setSales = useSetSales();
  const [q, setQ] = useState('');

  const shown = users
    .filter((u) => (u.label ?? '').toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.sales) - Number(a.sales) || (a.label ?? '').localeCompare(b.label ?? ''));

  const toggle = (id: string, sales: boolean) =>
    setSales.mutate({ id, sales }, { onError: (e) => toast(`Couldn't save: ${(e as Error).message}`, 'error') });

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
          shown.map((u) => (
            <label
              key={u.webex_person_id}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 2px', fontSize: 13, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={u.sales}
                disabled={setSales.isPending}
                onChange={(e) => toggle(u.webex_person_id, e.target.checked)}
              />
              {u.label ?? 'Unnamed Webex user'}
            </label>
          ))
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
