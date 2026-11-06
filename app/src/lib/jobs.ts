import { svcLabel } from '../components/Badges';
import { daysOut } from './format';
import type { Job, Profile } from './db.types';

export type JobKind = 'installs' | 'service';

export const JOB_KINDS = {
  installs: {
    heading: 'New installs',
    noun: 'new install',
    draft: 'New install',
    empty: 'No new installs found.',
    icon: 'ti-tool',
  },
  service: {
    heading: 'Service tickets',
    noun: 'service ticket',
    draft: 'New service ticket',
    empty: 'No service tickets found.',
    icon: 'ti-headset',
  },
} as const;

export const JOB_SELECT =
  '*,clients(company,account_number),sites(name),profiles!jobs_assigned_to_fkey(full_name)';

/** A job with the three joins the list and detail pane read. */
export type JobRow = Job & {
  clients: { company: string | null; account_number: string | null } | null;
  sites: { name: string | null } | null;
  profiles: { full_name: string | null } | null;
};

/** Just enough of a site for the pane's picker, which filters by client. */
export interface SiteLite {
  id: string;
  name: string | null;
  client_id: string;
}

export interface ClientLite {
  id: string;
  company: string;
  /** Only loaded where a picker needs to leave cancelled accounts out (the jobs board). */
  cancelled_date?: string | null;
}

/** Anything that is not a New Install is a service ticket, matching the old tab split. */
export const jobKindOf = (j: Pick<Job, 'type'>): JobKind =>
  j.type === 'New Install' ? 'installs' : 'service';

/** Installs are identified by the services sold on them; service tickets by their own title. */
export const jobSubtitle = (j: JobRow | Job): string =>
  j.type === 'New Install' ? svcLabel(j) : j.title || '—';

/** Services ticked on a New Install (the deal); the sales dashboard counts these. */
export const JOB_SVCS = [
  ['svc_internet', 'Internet'],
  ['svc_webex', 'Webex'],
  ['svc_nec', 'NEC'],
] as const;

/** Techs only add notes to existing jobs. */
export const canEditJob = (p: Profile | null) => p?.role === 'admin' || p?.role === 'ops';

/**
 * A past-due install (not cancelled) with nothing in the notes log or the old notes box.
 * An old box holding only a placeholder like "." or "-" (no letters or digits) counts as
 * empty. Unknown (false) until the notes have loaded, so a failed fetch does not flag
 * every job.
 */
export function jobNoNotes(
  j: JobRow,
  liveNotes: { id: string }[] | undefined,
  noteIndex: Record<string, string>,
  indexReady: boolean,
): boolean {
  return (
    j.type === 'New Install' &&
    j.status !== 'Cancelled' &&
    daysOut(j.due_date) < 0 &&
    !/[\p{L}\p{N}]/u.test(j.job_notes || '') &&
    (liveNotes ? !liveNotes.length : indexReady && !noteIndex[j.id])
  );
}

/** Mirrors the fetch order: due_date ascending, undated last. */
export function sortJobs<T extends { due_date: string | null }>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    if (!a.due_date && !b.due_date) return 0;
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0;
  });
}

/** record id → all its notes' text, lowercased and run together, for the list search. */
export function indexNotes<K extends string>(
  rows: ({ text: string | null } & Record<K, string>)[],
  key: K,
): Record<string, string> {
  const out: Record<string, string> = {};
  rows.forEach((r) => {
    out[r[key]] = (out[r[key]] || '') + '\n' + (r.text || '').toLowerCase();
  });
  return out;
}

/** The notes actually loaded for a record beat the bulk index built at page load. */
export const notesSearchText = (
  live: { text: string | null }[] | undefined,
  bulk: string | undefined,
) => (live ? live.map((n) => n.text || '').join('\n').toLowerCase() : bulk || '');
