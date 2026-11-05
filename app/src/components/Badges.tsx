import type { JobServices, ServiceFlags } from '../lib/db.types';

/** Job status. Unknown values fall back to grey, as they did before. */
export function StatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, string> = {
    Pending: 'badge-amber',
    Incomplete: 'badge-red',
    Complete: 'badge-green',
    Cancelled: 'badge-gray',
  };
  return <span className={`badge ${map[status ?? ''] ?? 'badge-gray'}`}>{status}</span>;
}

export function PortingStatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, string> = {
    Pending: 'badge-amber',
    'In Progress': 'badge-blue',
    Complete: 'badge-green',
    Cancelled: 'badge-gray',
  };
  return <span className={`badge ${map[status ?? ''] ?? 'badge-gray'}`}>{status}</span>;
}

export function ComplaintStatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, string> = { Pending: 'badge-amber', Closed: 'badge-green' };
  return <span className={`badge ${map[status ?? ''] ?? 'badge-gray'}`}>{status}</span>;
}

export function TypeBadge({ type }: { type: string | null | undefined }) {
  return type === 'New Install' ? (
    <span className="badge badge-blue">New Install</span>
  ) : (
    <span className="badge badge-gray">Service</span>
  );
}

/** Installs carried over from the old client services: they hold a client's services but were never a deal. */
export function LegacyBadge({ legacy }: { legacy: boolean | null | undefined }) {
  return legacy ? <span className="badge badge-gray">Legacy</span> : null;
}

/** "Webex, NEC and Internet" — prose, for sentences rather than badges. */
export function svcLabel(c: ServiceFlags | null | undefined): string {
  const svcs: string[] = [];
  if (c?.svc_webex) svcs.push('Webex');
  if (c?.svc_nec) svcs.push('NEC');
  if (c?.svc_internet) svcs.push('Internet');
  if (!svcs.length) return '—';
  if (svcs.length === 1) return svcs[0];
  return `${svcs.slice(0, -1).join(', ')} and ${svcs[svcs.length - 1]}`;
}

export function SvcBadges({
  services,
  sm = false,
  internetCount = 0,
}: {
  services: ServiceFlags | null | undefined;
  sm?: boolean;
  internetCount?: number;
}) {
  const cls = sm ? 'badge badge-sm' : 'badge';
  const any = services?.svc_webex || services?.svc_nec || services?.svc_internet;
  if (!any) return <span style={{ color: 'var(--text3)', fontSize: 12 }}>None</span>;
  return (
    <>
      {services?.svc_webex && <span className={`${cls} badge-purple`}>Webex</span>}
      {services?.svc_nec && <span className={`${cls} badge-nec`}>NEC</span>}
      {services?.svc_internet && (
        <span className={`${cls} badge-green`}>Internet{internetCount > 1 ? ` ×${internetCount}` : ''}</span>
      )}
    </>
  );
}

/**
 * What a client has, worked out from their installs; cancelled installs do not count.
 * Internet is counted (a line per site or deal); Webex and NEC are just yes or no.
 */
export function ClientSvcBadges({ jobs }: { jobs: JobServices[] | null | undefined }) {
  const live = (jobs ?? []).filter((j) => j.type === 'New Install' && j.status !== 'Cancelled');
  const internet = live.filter((j) => j.svc_internet).length;
  return (
    <SvcBadges
      services={{
        svc_internet: internet > 0,
        svc_webex: live.some((j) => j.svc_webex),
        svc_nec: live.some((j) => j.svc_nec),
      }}
      internetCount={internet}
    />
  );
}

/** The client's installs, with what ClientSvcBadges needs. */
export const CLIENT_JOBS = 'jobs(id,type,status,svc_internet,svc_webex,svc_nec)';
