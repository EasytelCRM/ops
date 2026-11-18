import { useEffect, useRef, useState } from 'react';
import { sb } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import { localYmd } from '../../lib/format';
import {
  emptyContactRow,
  saveClientContacts,
  toContactRow,
  type ContactRow,
} from '../../lib/clientContacts';
import type { Client, ClientContact } from '../../lib/db.types';
import { sitePlaceholder, suggestSiteName } from '../../lib/siteName';
import { clientName, clientNameMatches } from '../../lib/clientName';
import { isActiveStaff } from '../../lib/roles';
import { useProfiles } from '../../hooks/useClients';
import { useToast } from '../../state/ToastProvider';

interface AddressRow {
  key: string;
  name: string;
  address: string;
}

/** The default name for an address row, given the other rows' addresses. */
function addressRowSuggestion(rows: AddressRow[], row: AddressRow): string {
  if (!row.address.trim()) return '';
  return suggestSiteName(
    row.address,
    rows.filter((r) => r.key !== row.key).map((r) => r.address),
  );
}

/** Friendly message for client save failures, incl. DB unique-constraint violations. */
function clientSaveError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? '';
  if (m.includes('clients_name_unique'))
    return 'A client with that entity name and trading name already exists';
  if (m.includes('clients_account_number_unique'))
    return 'That account number is already in use by another client';
  return `Save failed: ${m}`;
}

export function ClientModal({
  id,
  allClients,
  currentUserId,
  onClose,
  onSaved,
  onOpenClient,
}: {
  id?: string;
  /** Used for the duplicate check and the name suggestions. */
  allClients: Pick<Client, 'id' | 'company' | 'trading_name' | 'account_number'>[];
  currentUserId: string;
  onClose: () => void;
  onSaved: (clientId: string) => void;
  onOpenClient: (clientId: string) => void;
}) {
  const isEdit = !!id;
  const toast = useToast();

  const [loading, setLoading] = useState(isEdit);
  const [company, setCompany] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [acct, setAcct] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [hardwareOnly, setHardwareOnly] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [cancelledDate, setCancelledDate] = useState('');
  const [salesRep, setSalesRep] = useState('');
  const { data: profiles = [] } = useProfiles();
  const [contacts, setContacts] = useState<ContactRow[]>([emptyContactRow()]);
  const [primaryKey, setPrimaryKey] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<AddressRow[]>([
    { key: crypto.randomUUID(), name: '', address: '' },
  ]);
  const [series, setSeries] = useState<'easytel' | 'budget'>('easytel');
  const [saving, setSaving] = useState(false);
  /** Which name box is showing the "already a client?" suggestions. */
  const [suggestFor, setSuggestFor] = useState<'company' | 'trading' | null>(null);

  const origContacts = useRef<ClientContact[]>([]);
  /** The list projection has no sales_rep, so the audit's "before" comes from the fresh load. */
  const origSalesRep = useRef<string | null>(null);
  /** The number we filled in, so a save can tell it from a typed one. */
  const autoAcct = useRef<string | null>(null);
  /** Remembers the account number while Hardware only is ticked. */
  const prevAcct = useRef('');

  /**
   * New clients get the next free number in a series (Easytel 30xxxx / Budget 60xxxx)
   * from next_account_number().
   */
  const fillNextAccount = async (s: 'easytel' | 'budget', force = false) => {
    setSeries(s);
    const { data, error } = await sb.rpc('next_account_number', { series: s });
    if (error) {
      toast(`Could not get the next account number: ${error.message}`, 'warn');
      return;
    }
    setAcct((cur) => {
      // Do not overwrite a number typed while this was loading, unless the series was picked on purpose
      const keep = !force && cur.trim() && cur.trim() !== autoAcct.current;
      return keep ? cur : data;
    });
    autoAcct.current = data;
  };

  // Always fetch the full record fresh — the list holds only a partial projection, which
  // would prefill blanks and wipe data on save.
  useEffect(() => {
    if (!id) {
      void fillNextAccount('easytel');
      return;
    }
    void (async () => {
      const [{ data, error }, { data: cts, error: ctErr }] = await Promise.all([
        sb.from('clients').select('*').eq('id', id).single(),
        sb.from('client_contacts').select('*').eq('client_id', id).order('sort', { ascending: true }),
      ]);
      if (error || ctErr) {
        toast(`Could not load client: ${(error ?? ctErr)!.message}`, 'error');
        onClose();
        return;
      }
      const c = (data ?? {}) as Client;
      const list = (cts ?? []) as ClientContact[];
      origContacts.current = list;
      setCompany(c.company ?? '');
      setTradingName(c.trading_name ?? '');
      setAcct(c.account_number ?? '');
      setPhone(c.phone ?? '');
      setEmail(c.email ?? '');
      setHardwareOnly(!!c.hardware_only);
      setCancelled(!!c.cancelled_date);
      setCancelledDate(c.cancelled_date ?? '');
      origSalesRep.current = c.sales_rep ?? null;
      setSalesRep(c.sales_rep ?? '');
      const rows = list.length ? list.map(toContactRow) : [emptyContactRow()];
      setContacts(rows);
      setPrimaryKey(rows.find((r) => list.find((l) => l.id === r.id)?.is_primary)?.key ?? rows[0]?.key ?? null);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!isEdit && primaryKey === null && contacts.length) setPrimaryKey(contacts[0].key);
  }, [isEdit, primaryKey, contacts]);

  /**
   * Hardware-only clients (outright sale, no recurring billing) do not get an account
   * number. Unticking gives a new client the next number again, or an existing one back
   * what it had.
   */
  const toggleHardwareOnly = (on: boolean) => {
    setHardwareOnly(on);
    if (on) {
      prevAcct.current = acct;
      setAcct('');
    } else if (isEdit) {
      setAcct(prevAcct.current);
    } else {
      void fillNextAccount(series, true);
    }
  };

  /** Ticking starts the date at today (local, not UTC); unticking hides it and the save clears it. */
  const toggleCancelled = (on: boolean) => {
    setCancelled(on);
    if (on && !cancelledDate) setCancelledDate(localYmd());
  };

  const patchContact = (key: string, patch: Partial<ContactRow>) =>
    setContacts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Whatever is typed in either name box is matched against both names of every client
  const suggestText = (suggestFor === 'trading' ? tradingName : suggestFor === 'company' ? company : '')
    .trim()
    .toLowerCase();
  const suggestions =
    suggestText.length >= 2
      ? allClients.filter((c) => c.id !== id && clientNameMatches(c, suggestText)).slice(0, 6)
      : [];

  const nextAcctNumber = async () => {
    const { data, error } = await sb.rpc('next_account_number', { series });
    if (error) throw error;
    return data;
  };

  const submitAdd = async () => {
    const name = company.trim();
    if (!name) return toast('Entity name is required', 'warn');
    const acctNum = acct.trim();
    // A filled-in number is re-checked at save time: someone may have added a client since the form opened
    const shownAcct = acctNum;
    const isAuto = !!acctNum && acctNum === autoAcct.current;
    if (!isAuto && acctNum && allClients.some((c) => c.account_number === acctNum))
      return toast('Account number already in use', 'error');

    // A blank account number is saved as empty (null), which the unique index allows any number of times
    const payload: Record<string, unknown> = {
      company: name,
      trading_name: tradingName.trim() || null,
      account_number: acctNum || null,
      hardware_only: hardwareOnly,
      phone: phone.trim(),
      email: email.trim(),
      sales_rep: salesRep || null,
      created_by: currentUserId,
    };
    setSaving(true);
    try {
      if (isAuto) payload.account_number = await nextAcctNumber();
      let data: Client | null = null;
      let error: { message?: string } | null = null;
      for (let tries = 0; ; tries++) {
        ({ data, error } = (await sb
          .from('clients')
          .insert(payload as never)
          .select()
          .single()) as { data: Client | null; error: { message?: string } | null });
        // Two people saving at once can both get the same number; the unique index stops
        // the second, which takes the next one
        if (!(error && isAuto && tries < 3 && (error.message ?? '').includes('clients_account_number_unique')))
          break;
        payload.account_number = await nextAcctNumber();
      }
      if (error) throw error;
      await logAudit('created', 'clients', data!.id, {}, payload);

      const sites = addresses
        .map((row, i) => ({
          client_id: data!.id,
          name: row.name.trim() || addressRowSuggestion(addresses, row) || `Site ${i + 1}`,
          address: row.address.trim(),
        }))
        .filter((s) => s.address)
        // The first address filled in is the new client's primary site
        .map((s, i) => ({ ...s, is_primary: i === 0 }));
      if (sites.length) {
        const { error: sErr } = await sb.from('sites').insert(sites);
        if (sErr) throw sErr;
      }
      await saveClientContacts(data!.id, [], contacts, primaryKey);
      onClose();
      toast(
        isAuto && payload.account_number !== shownAcct
          ? `Client added as ${String(payload.account_number)} (${shownAcct} was just taken)`
          : 'Client added',
      );
      onSaved(data!.id);
    } catch (e) {
      toast(clientSaveError(e), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const submitEdit = async () => {
    const acctNum = acct.trim();
    if (acctNum && allClients.some((c) => c.account_number === acctNum && c.id !== id))
      return toast('Account number already in use', 'error');
    if (cancelled && !cancelledDate) return toast('Cancelled date is required', 'warn');
    if (!company.trim()) return toast('Entity name is required', 'warn');
    const payload = {
      company: company.trim(),
      trading_name: tradingName.trim() || null,
      account_number: acctNum || null,
      hardware_only: hardwareOnly,
      phone: phone.trim(),
      email: email.trim(),
      cancelled_date: cancelled ? cancelledDate : null,
      sales_rep: salesRep || null,
    };
    setSaving(true);
    try {
      const old = { ...allClients.find((c) => c.id === id), sales_rep: origSalesRep.current };
      const { error } = await sb.from('clients').update(payload).eq('id', id!);
      if (error) throw error;
      await logAudit('updated', 'clients', id!, old, payload);
      await saveClientContacts(id!, origContacts.current, contacts, primaryKey);
      onClose();
      toast('Client updated');
      onSaved(id!);
    } catch (e) {
      toast(clientSaveError(e), 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  if (loading)
    return (
      <div className="modal">
        <div className="modal-hdr">
          <h3>Edit client</h3>
          <button className="modal-x" onClick={onClose}>
            <i className="ti ti-x" />
          </button>
        </div>
        <div className="empty">
          <i className="ti ti-refresh" style={{ animation: 'spin 1s linear infinite' }} />
          <p>Loading...</p>
        </div>
      </div>
    );

  // Active users ticked as sales reps; a client's current rep stays listed after they stop
  // being one, so saving the form does not quietly clear it
  const repOptions = profiles.filter((p) => (p.is_sales_rep && isActiveStaff(p)) || p.id === salesRep);

  /** "Already a client?" — opens the match instead of adding a duplicate. */
  const suggestBox = suggestions.length > 0 && (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 200,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        marginTop: 4,
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
      }}
    >
      {suggestions.map((c) => (
        <div
          key={c.id}
          style={{
            padding: '10px 14px',
            cursor: 'pointer',
            borderBottom: '1px solid var(--border)',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            onClose();
            onOpenClient(c.id);
          }}
        >
          <span style={{ flex: 1 }}>
            <span style={{ fontWeight: 500 }}>{clientName(c)}</span>
            {c.trading_name && (
              <span style={{ display: 'block', fontSize: 12, color: 'var(--text2)' }}>{c.company}</span>
            )}
          </span>
          {c.account_number && (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{c.account_number}</span>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="modal">
      <div className="modal-hdr">
        <h3>{isEdit ? 'Edit client' : 'New client'}</h3>
        <button className="modal-x" onClick={onClose}>
          <i className="ti ti-x" />
        </button>
      </div>

      <div className="form-group">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <label className="lbl">Account number</label>
          {!isEdit && !hardwareOnly && (
            <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              {(['easytel', 'budget'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`filter-btn${series === s ? ' active' : ''}`}
                  onClick={() => void fillNextAccount(s, true)}
                >
                  {s === 'easytel' ? 'Easytel' : 'Budget'}
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          className="fi"
          value={acct}
          disabled={hardwareOnly}
          placeholder={hardwareOnly ? 'No account number' : isEdit ? 'ACC-10042' : 'Getting next number…'}
          onChange={(e) => setAcct(e.target.value)}
        />
        <label className="checkbox-label" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={hardwareOnly}
            onChange={(e) => toggleHardwareOnly(e.target.checked)}
          />{' '}
          Hardware only (no recurring billing, no account number)
        </label>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="lbl">Entity name *</label>
          <div style={{ position: 'relative' }}>
            <input
              className="fi"
              value={company}
              placeholder="Acme Pty Ltd"
              autoComplete="off"
              onChange={(e) => {
                setCompany(e.target.value);
                setSuggestFor('company');
              }}
              onBlur={() => setTimeout(() => setSuggestFor(null), 150)}
            />
            {suggestFor === 'company' && suggestBox}
          </div>
        </div>
        <div className="form-group">
          <label className="lbl">Trading name</label>
          <div style={{ position: 'relative' }}>
            <input
              className="fi"
              value={tradingName}
              placeholder="If different, e.g. Acme Plumbing"
              autoComplete="off"
              onChange={(e) => {
                setTradingName(e.target.value);
                setSuggestFor('trading');
              }}
              onBlur={() => setTimeout(() => setSuggestFor(null), 150)}
            />
            {suggestFor === 'trading' && suggestBox}
          </div>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="lbl">Phone</label>
          <input
            className="fi"
            value={phone}
            placeholder="02 9000 0000"
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="lbl">Email</label>
          <input
            className="fi"
            value={email}
            placeholder="info@company.com.au"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="lbl">Sales rep</label>
        <select className="fi" value={salesRep} onChange={(e) => setSalesRep(e.target.value)}>
          <option value="">—</option>
          {repOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label className="lbl">Contacts</label>
        <div>
          {contacts.map((ct) => (
            <div className="ct-row" key={ct.key}>
              <div className="ct-line">
                <input
                  className="fi ct-name"
                  value={ct.name}
                  placeholder="Name"
                  style={{ flex: 3 }}
                  onChange={(e) => patchContact(ct.key, { name: e.target.value })}
                />
                <input
                  className="fi ct-note"
                  value={ct.note}
                  placeholder="Note, e.g. Accounts"
                  style={{ flex: 2 }}
                  onChange={(e) => patchContact(ct.key, { note: e.target.value })}
                />
                <label
                  className="checkbox-label"
                  title="Primary contact"
                  style={{ flexShrink: 0, fontSize: 12 }}
                >
                  <input
                    type="radio"
                    name="ct-primary"
                    checked={primaryKey === ct.key}
                    onChange={() => setPrimaryKey(ct.key)}
                  />{' '}
                  Primary
                </label>
                <button
                  type="button"
                  className="btn btn-sm"
                  title="Remove contact"
                  style={{ flexShrink: 0, padding: '7px 9px' }}
                  onClick={() => setContacts((rows) => rows.filter((r) => r.key !== ct.key))}
                >
                  <i className="ti ti-x" />
                </button>
              </div>
              <div className="ct-line">
                <input
                  className="fi ct-phone"
                  value={ct.phone}
                  placeholder="Phone"
                  style={{ flex: 1 }}
                  onChange={(e) => patchContact(ct.key, { phone: e.target.value })}
                />
                <input
                  className="fi ct-mobile"
                  value={ct.mobile}
                  placeholder="Mobile"
                  style={{ flex: 1 }}
                  onChange={(e) => patchContact(ct.key, { mobile: e.target.value })}
                />
                <input
                  className="fi ct-email"
                  value={ct.email}
                  placeholder="Email"
                  style={{ flex: 1.6 }}
                  onChange={(e) => patchContact(ct.key, { email: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-sm"
          style={{ marginTop: 4 }}
          onClick={() =>
            setContacts((rows) => {
              const row = emptyContactRow();
              if (!rows.some((r) => r.key === primaryKey)) setPrimaryKey(row.key);
              return [...rows, row];
            })
          }
        >
          <i className="ti ti-plus" /> Add contact
        </button>
      </div>

      {isEdit && (
        <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label className="checkbox-label">
            <input type="checkbox" checked={cancelled} onChange={(e) => toggleCancelled(e.target.checked)} />{' '}
            Account cancelled
          </label>
          {cancelled && (
            <input
              type="date"
              className="fi"
              value={cancelledDate}
              style={{ width: 'auto' }}
              onChange={(e) => setCancelledDate(e.target.value)}
            />
          )}
        </div>
      )}

      {!isEdit && (
        <div className="form-group">
          <label className="lbl">Addresses</label>
          <div>
            {addresses.map((row, i) => (
              <div
                className="site-row"
                key={row.key}
                style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}
              >
                <input
                  className="fi site-name-input"
                  value={row.name}
                  placeholder={sitePlaceholder(addressRowSuggestion(addresses, row))}
                  style={{ flex: 1 }}
                  onChange={(e) =>
                    setAddresses((rows) =>
                      rows.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)),
                    )
                  }
                />
                <input
                  className="fi site-addr-input"
                  value={row.address}
                  placeholder="123 Main St, Sydney NSW 2000"
                  style={{ flex: 2 }}
                  onChange={(e) =>
                    setAddresses((rows) =>
                      rows.map((r) => (r.key === row.key ? { ...r, address: e.target.value } : r)),
                    )
                  }
                />
                {i > 0 && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ flexShrink: 0, padding: '7px 9px' }}
                    onClick={() => setAddresses((rows) => rows.filter((r) => r.key !== row.key))}
                  >
                    <i className="ti ti-x" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginTop: 4 }}
            onClick={() => setAddresses((rows) => [...rows, { key: crypto.randomUUID(), name: '', address: '' }])}
          >
            <i className="ti ti-plus" /> Add another address
          </button>
        </div>
      )}

      <div className="modal-ftr">
        <button className="btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={saving}
          onClick={() => void (isEdit ? submitEdit() : submitAdd())}
        >
          {isEdit ? 'Save changes' : 'Add client'}
        </button>
      </div>
    </div>
  );
}
