import { sb } from './supabase';
import type { Porting } from './db.types';

export const PORTING_SELECT = '*,clients(company,account_number)';

export type PortingRow = Porting & {
  clients: { company: string | null; account_number: string | null } | null;
};

export const PORTING_STATUSES = ['Pending', 'Complete', 'Cancelled'] as const;

/**
 * TBC tickets first (they still need a ticket number chasing), then the fetch order:
 * port_date then port_time, undated last.
 */
export function sortPorting<T extends Pick<Porting, 'phone_numbers' | 'port_date' | 'port_time'>>(
  rows: T[],
): T[] {
  const isTbc = (p: T) => (p.phone_numbers ?? '').toUpperCase() === 'TBC';
  return [...rows].sort(
    (a, b) =>
      Number(isTbc(b)) - Number(isTbc(a)) ||
      (a.port_date || '9999-99-99').localeCompare(b.port_date || '9999-99-99') ||
      (a.port_time || '99:99').localeCompare(b.port_time || '99:99'),
  );
}

/**
 * Ticket numbers are typed by hand. A Pending port can be logged before the carrier
 * issues one, so blank is stored as 'TBC' (the column is NOT NULL) instead of a made-up
 * number. Returns null when a real number is required.
 */
export function resolvePortingTicketNo(raw: string, status: string): string | null {
  if (raw && raw.toUpperCase() !== 'TBC') return raw;
  return status === 'Pending' ? 'TBC' : null;
}

/**
 * Assist Portal links carry the request number in the path, e.g.
 * https://assistportal.io/#/ITSMRequest/REQ0053590/SelfService
 */
export function reqFromTicketUrl(url: string | null | undefined): string | null {
  const m = /REQ\d+/i.exec(url || '');
  return m ? m[0].toUpperCase() : null;
}

/**
 * Warns — but does not block — when the number is already on another ticket. A number
 * can legitimately move between accounts, but it is usually a mistyped or reused one.
 */
export async function confirmPortingTicketNo(numbers: string, excludeId?: string) {
  if (['TBC', 'N/A'].includes(numbers.toUpperCase())) return true; // placeholders, not real ticket numbers
  let q = sb
    .from('porting')
    .select('id,clients(company,account_number)')
    .ilike('phone_numbers', numbers.replace(/[\\%_]/g, '\\$&'));
  if (excludeId) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error || !data?.length) return true; // don't stop a save because the check failed
  const list = (data as unknown as PortingRow[])
    .map((p) => `• ${p.clients?.company || 'Unknown'} (${p.clients?.account_number || '—'})`)
    .join('\n');
  return confirm(`Ticket number ${numbers} is already used on:\n${list}\n\nSave anyway?`);
}
