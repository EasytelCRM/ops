import { sb } from './supabase';
import { logAudit } from './audit';
import type { ClientContact } from './db.types';

/** One row of the Contacts editor inside the client modal. */
export interface ContactRow {
  /** Local key; null id means a row that has not been saved yet. */
  key: string;
  id: string | null;
  name: string;
  note: string;
  phone: string;
  mobile: string;
  email: string;
}

export const CONTACT_FIELDS = ['name', 'note', 'phone', 'mobile', 'email', 'is_primary'] as const;

export const emptyContactRow = (): ContactRow => ({
  key: crypto.randomUUID(),
  id: null,
  name: '',
  note: '',
  phone: '',
  mobile: '',
  email: '',
});

export const toContactRow = (ct: ClientContact): ContactRow => ({
  key: ct.id,
  id: ct.id,
  name: ct.name ?? '',
  note: ct.note ?? '',
  phone: ct.phone ?? '',
  mobile: ct.mobile ?? '',
  email: ct.email ?? '',
});

const hasAnything = (r: ContactRow) => !!(r.name || r.phone || r.mobile || r.email);

/**
 * Saves the modal's contact rows: removed rows are deleted, changed ones updated, new ones
 * added. Rows with no name, phone, mobile or email are ignored. One contact is primary (the
 * ticked one, else the first); the old primary is cleared first so the one-primary-per-client
 * index never sees two.
 */
export async function saveClientContacts(
  clientId: string,
  original: ClientContact[],
  rows: ContactRow[],
  primaryKey: string | null,
) {
  const kept_rows = rows.filter(hasAnything);
  const primaryIdx = Math.max(
    0,
    kept_rows.findIndex((r) => r.key === primaryKey),
  );
  const want = kept_rows.map((r, i) => ({
    id: r.id,
    name: r.name,
    note: r.note,
    phone: r.phone,
    mobile: r.mobile,
    email: r.email,
    is_primary: i === primaryIdx,
    sort: i,
  }));

  const kept = new Set(want.filter((w) => w.id).map((w) => w.id));
  const removed = original.filter((o) => !kept.has(o.id));
  const changed = want
    .filter((w) => w.id)
    .map((w) => {
      const o = (original.find((x) => x.id === w.id) ?? {}) as Record<string, unknown>;
      const diff: Record<string, unknown> = {};
      [...CONTACT_FIELDS, 'sort'].forEach((f) => {
        if (o[f] !== (w as unknown as Record<string, unknown>)[f])
          diff[f] = (w as unknown as Record<string, unknown>)[f];
      });
      return { w, o, diff };
    })
    .filter((x) => Object.keys(x.diff).length);
  const added = want
    .filter((w) => !w.id)
    .map(({ id: _id, ...w }) => ({ ...w, client_id: clientId }));

  if (removed.length) {
    const { error } = await sb
      .from('client_contacts')
      .delete()
      .in(
        'id',
        removed.map((o) => o.id),
      );
    if (error) throw error;
  }
  // Clear the outgoing primary first, or the unique index sees two at once
  for (const x of changed.filter((x) => x.diff.is_primary === false)) {
    const { error } = await sb.from('client_contacts').update({ is_primary: false }).eq('id', x.w.id!);
    if (error) throw error;
  }
  for (const x of changed) {
    const rest = { ...x.diff };
    if (rest.is_primary === false) delete rest.is_primary;
    if (!Object.keys(rest).length) continue;
    // Dynamic keys: the diff is built column by column, which update()'s types cannot narrow
    const { error } = await sb
      .from('client_contacts')
      .update(rest as Partial<ClientContact>)
      .eq('id', x.w.id!);
    if (error) throw error;
  }
  let inserted: ClientContact[] = [];
  if (added.length) {
    const { data, error } = await sb.from('client_contacts').insert(added).select();
    if (error) throw error;
    inserted = (data ?? []) as ClientContact[];
  }

  // Audit: sort-only changes (a row removed above) are not logged
  const pick = (obj: Record<string, unknown>, keys: readonly string[]) =>
    Object.fromEntries(keys.map((k) => [k, obj[k]]));
  for (const o of removed)
    await logAudit('deleted', 'client_contacts', o.id, o, { name: o.name, client_id: clientId });
  for (const x of changed) {
    const keys = Object.keys(x.diff).filter((k) => k !== 'sort');
    if (keys.length)
      await logAudit(
        'updated',
        'client_contacts',
        x.w.id!,
        { name: x.o.name, ...pick(x.o, keys) },
        { name: x.w.name, ...pick(x.w as unknown as Record<string, unknown>, keys) },
      );
  }
  for (const n of inserted)
    await logAudit('created', 'client_contacts', n.id, {}, {
      ...pick(n as unknown as Record<string, unknown>, CONTACT_FIELDS),
      client_id: clientId,
    });
}
