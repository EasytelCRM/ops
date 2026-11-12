import { useEffect, useState } from 'react';
import { sb } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import type { Site } from '../../lib/db.types';
import { sitePlaceholder, suggestSiteName } from '../../lib/siteName';
import { useToast } from '../../state/ToastProvider';

export function SiteModal({
  clientId,
  site,
  onClose,
  onSaved,
}: {
  clientId: string;
  /** Absent for a new site. */
  site?: Site;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!site;
  const toast = useToast();
  const [name, setName] = useState(site?.name ?? '');
  const [address, setAddress] = useState(site?.address ?? '');
  const [saving, setSaving] = useState(false);
  /** The client's other sites' addresses, so a blank name can tell same-suburb sites apart. */
  const [otherAddresses, setOtherAddresses] = useState<string[] | null>(null);

  useEffect(() => {
    let live = true;
    void sb
      .from('sites')
      .select('id, address')
      .eq('client_id', clientId)
      .then(({ data }) => {
        if (live) setOtherAddresses((data ?? []).filter((s) => s.id !== site?.id).map((s) => s.address ?? ''));
      });
    return () => {
      live = false;
    };
  }, [clientId, site?.id]);

  const suggestion = address.trim() ? suggestSiteName(address, otherAddresses ?? []) : '';

  const submit = async () => {
    const trimmed = name.trim() || suggestion;
    if (!trimmed) return toast('Enter a site name, or an address with a suburb', 'warn');
    setSaving(true);
    try {
      if (isEdit) {
        const payload = { name: trimmed, address: address.trim() };
        const { error } = await sb.from('sites').update(payload).eq('id', site.id);
        if (error) throw error;
        await logAudit('updated', 'sites', site.id, {}, payload);
        onClose();
        toast('Site updated');
      } else {
        // A client's first site is their primary; later ones never take over on their own
        const { count, error: cErr } = await sb
          .from('sites')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId);
        if (cErr) throw cErr;
        // Contacts live on the client (Edit client), not on sites
        const payload = {
          client_id: clientId,
          name: trimmed,
          address: address.trim(),
          is_primary: count === 0,
        };
        const { data, error } = await sb.from('sites').insert(payload).select().single();
        if (error) throw error;
        await logAudit('created', 'sites', data.id, {}, payload);
        onClose();
        toast('Site added');
      }
      onSaved();
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <div className="modal">
      <div className="modal-hdr">
        <h3>{isEdit ? 'Edit site' : 'New site'}</h3>
        <button className="modal-x" onClick={onClose}>
          <i className="ti ti-x" />
        </button>
      </div>
      <div className="form-group">
        <label className="lbl">Site name</label>
        <input
          className="fi"
          value={name}
          placeholder={sitePlaceholder(suggestion)}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="lbl">Address</label>
        <input
          className="fi"
          value={address}
          placeholder="123 Main St, Sydney NSW 2000"
          onChange={(e) => setAddress(e.target.value)}
        />
      </div>
      <div className="modal-ftr">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={saving || otherAddresses === null} onClick={() => void submit()}>
          {isEdit ? 'Save changes' : 'Add site'}
        </button>
      </div>
    </div>
  );
}
