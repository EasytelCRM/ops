/** Shared shape of a log entry across client_notes, job_notes and complaint_notes. */
export type NoteRow = {
  id: string;
  text: string | null;
  /** Client notes carry a heading; job and complaint notes do not. */
  title?: string | null;
  created_at: string;
  created_by: string | null;
  updated_at?: string | null;
  updated_by?: string | null;
  profiles?: { full_name: string | null } | null;
};

/** A note being edited in place. `id` is 'legacy' for a record's own old notes column. */
export type NoteEdit = {
  id: string;
  orig: string;
  value: string;
  origTitle?: string;
  title?: string;
};

/** Newest entries shown before "Show older notes". */
export const JN_VISIBLE = 3;
export const CLN_VISIBLE = 10;

/** "Tue, 4 Nov 2026, 3:12 pm · 2h ago" — the relative half is dropped past a week. */
export function fmtNoteWhen(d: string): string {
  const dt = new Date(d);
  const abs = dt.toLocaleString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  const mins = Math.floor((Date.now() - dt.getTime()) / 60000);
  const rel =
    mins < 1
      ? 'just now'
      : mins < 60
        ? `${mins}m ago`
        : mins < 1440
          ? `${Math.floor(mins / 60)}h ago`
          : mins < 10080
            ? `${Math.floor(mins / 1440)}d ago`
            : '';
  return rel ? `${abs} · ${rel}` : abs;
}
