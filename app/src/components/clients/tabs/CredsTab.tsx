import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sb } from '../../../lib/supabase';
import { logAudit } from '../../../lib/audit';
import { CRED_FIELDS, Linkify, type CredField } from '../../../lib/creds';
import { isAdminOrOps } from '../../../lib/roles';
import { useAuth } from '../../../state/AuthProvider';
import { useToast } from '../../../state/ToastProvider';
import type { Client } from '../../../lib/db.types';

/** Three separate cards, each edited and saved on its own. */
export function CredsTab({ client }: { client: Client }) {
  const { profile } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit buttons only for admin/ops; techs can read credentials but not change them
  const canEdit = isAdminOrOps(profile);

  const startEdit = (f: CredField) => {
    setDraft((client[f.col] as string | null) ?? '');
    setEditing(f.k);
  };

  const save = async (f: CredField) => {
    const val = draft.trim() || null;
    const before = { [f.col]: client[f.col] ?? null };
    setSaving(true);
    try {
      // Dynamic key: Supabase's update() types cannot narrow a computed column name
      const { error } = await sb
        .from('clients')
        .update({ [f.col]: val } as Partial<Client>)
        .eq('id', client.id);
      if (error) throw error;
      await logAudit('updated', 'clients', client.id, before, { [f.col]: val });
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['client', client.id] });
      toast(`${f.label} credentials saved`);
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {CRED_FIELDS.map((f) => {
        const val = ((client[f.col] as string | null) ?? '').toString();
        const isEditing = editing === f.k;
        return (
          <div className="site-card cred-card" key={f.k}>
            <div className="site-body">
              <div className="site-name">
                <i className={`ti ${f.icon}`} /> {f.label}
              </div>
              {isEditing ? (
                <>
                  <textarea
                    className="fi cred-input"
                    placeholder={f.ph}
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => void save(f)}>
                      <i className="ti ti-check" /> Save
                    </button>
                    <button className="btn btn-sm" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <div className={`cred-val${val ? '' : ' empty-val'}`}>
                  {val ? <Linkify text={val} /> : 'Nothing stored yet.'}
                </div>
              )}
            </div>
            {canEdit && !isEditing && (
              <div style={{ flexShrink: 0 }}>
                <button className="btn btn-sm" title={`Edit ${f.label}`} onClick={() => startEdit(f)}>
                  <i className="ti ti-edit" />
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
