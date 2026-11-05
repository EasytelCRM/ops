import { useState } from 'react';
import { sb } from '../../lib/supabase';
import type { Role } from '../../lib/db.types';
import { useToast } from '../../state/ToastProvider';

/**
 * Inviting a team member. admin.inviteUserByEmail needs the service role key, which a
 * browser never has, so this reliably fails and says to invite from the Supabase
 * dashboard instead — exactly as the single-file app did. The Edge Function that would
 * make it work is still unbuilt.
 */
export function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('technician');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    try {
      const { error: err } = await sb.auth.admin.inviteUserByEmail(email.trim(), {
        data: { full_name: name.trim(), role },
      });
      if (err) throw err;
      onClose();
      toast(`Invite sent to ${email.trim()}`);
      onInvited();
    } catch (e) {
      setError(
        `Invite failed: ${(e as Error).message}. Ensure the user is invited from the Supabase dashboard.`,
      );
    }
  };

  return (
    <div className="modal">
      <div className="modal-hdr">
        <h3>Invite team member</h3>
        <button className="modal-x" onClick={onClose}>
          <i className="ti ti-x" />
        </button>
      </div>
      <div className="form-group">
        <label className="lbl">Full name *</label>
        <input
          className="fi"
          placeholder="Jane Smith"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="lbl">Email *</label>
        <input
          className="fi"
          type="email"
          placeholder="jane@company.com.au"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="lbl">Role *</label>
        <select className="fi" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="technician">Tech</option>
          <option value="ops">Ops</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-ftr">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void submit()}>
          <i className="ti ti-send" /> Send invite
        </button>
      </div>
    </div>
  );
}
