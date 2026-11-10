import { useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { sb } from '../../lib/supabase';
import type { Role } from '../../lib/db.types';
import { useToast } from '../../state/ToastProvider';

/**
 * Inviting a team member, through the `invite-user` Edge Function (sending an invite needs
 * the service role key, which a browser never has). The function checks the caller is an
 * admin, sends Supabase's invite email, and sets the new account's role and switches it on,
 * so there is no separate Activate step for someone invited here.
 */
export function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('technician');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await sb.functions.invoke('invite-user', {
        body: {
          full_name: name.trim(),
          email: email.trim(),
          role,
          // The invite link comes back to this CRM, wherever it is being served from
          redirect_to: `${location.origin}${location.pathname}`,
        },
      });
      if (err) {
        // The function's own message ("already has a CRM account" etc.) beats the generic one
        const msg =
          err instanceof FunctionsHttpError
            ? ((await err.context.json().catch(() => null)) as { error?: string } | null)?.error
            : null;
        throw new Error(msg || err.message);
      }
      onClose();
      toast(`Invite sent to ${email.trim()}`);
      onInvited();
    } catch (e) {
      setError(`Invite failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
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
          {/* A TV login for the sales call stats: sees the wallboard and nothing else */}
          <option value="wallboard">Wallboard</option>
        </select>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
        They'll get an email with a link to set their password, and can sign in straight away.
      </p>
      {error && <div className="form-error">{error}</div>}
      <div className="modal-ftr">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void submit()}>
          <i className="ti ti-send" /> {busy ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </div>
  );
}
