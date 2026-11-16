/**
 * A client has a legal entity name (`company`) and, often, a different trading name.
 * Staff know most clients by the trading name, so that is the one shown; searches match
 * either.
 */
type Named = { company?: string | null; trading_name?: string | null } | null | undefined;

/** The name staff know a client by: its trading name, else its entity name. */
export const clientName = (c: Named, fallback = 'Unknown') => c?.trading_name || c?.company || fallback;

/** Whether either name contains q (already lower-cased). */
export const clientNameMatches = (c: Named, q: string) =>
  !!c && [c.company, c.trading_name].some((v) => (v ?? '').toLowerCase().includes(q));

/** A–Z by the name shown. */
export const byClientName = (a: Named, b: Named) =>
  clientName(a, '').localeCompare(clientName(b, ''), undefined, { sensitivity: 'base' });
