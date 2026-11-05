/** Ported verbatim from the single-file app so dates read identically. */

export const initials = (s: string | null | undefined) =>
  String(s || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export const today = () => new Date().toISOString().slice(0, 10);

export const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const fmtDateTime = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleString('en-AU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

/** Timestamp → "YYYY-MM-DDTHH:MM" in local time, for datetime-local inputs (to the minute). */
export function toLocalDateTime(d: string | null | undefined): string {
  if (!d) return '';
  const t = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}T${p(t.getHours())}:${p(t.getMinutes())}`;
}

/** Days until a dated record comes due; undated ones sort as "far away" so they never flag as due. */
export function daysOut(d: string | null | undefined): number {
  if (!d) return 9999;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${d}T00:00:00`).getTime() - start.getTime()) / 86400000);
}

/** First phone-shaped run in the string, as a tel: href — or null if there isn't one. */
export function telLink(n: string | null | undefined): string | null {
  const d = ((n || '').match(/\+?\d[\d ]{5,}/) || [''])[0].replace(/\s/g, '');
  return d ? `tel:${d}` : null;
}

/** First email-shaped run in the string, as a mailto: href — or null if there isn't one. */
export function mailLink(e: string | null | undefined): string | null {
  const m = ((e || '').match(/[^\s@]+@[^\s@]+\.[^\s@]+/) || [''])[0];
  return m ? `mailto:${m}` : null;
}
