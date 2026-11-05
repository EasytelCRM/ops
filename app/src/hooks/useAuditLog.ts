import { useQuery } from '@tanstack/react-query';
import { sb } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import type { AuditLog } from '../lib/db.types';
import { jobLabel, type AuditJobLite, type AuditLookups } from '../lib/auditView';

interface Lite {
  id: string;
}
type ClientLite = Lite & { company: string | null };
type ProfileLite = Lite & { full_name: string | null };
type ComplaintLite = Lite & {
  complainant: string | null;
  tio_ref: string | null;
  clients: { company: string | null } | null;
};

const index = <T extends Lite>(rows: T[], name: (r: T) => string) =>
  Object.fromEntries(rows.map((r) => [r.id, name(r)]));

/**
 * The hundred most recent entries, plus the id → name lookups that turn the raw column
 * values into something readable. The single-file app had those lists loaded already;
 * here the page fetches its own narrow copies.
 */
export function useAuditLog() {
  return useQuery({
    queryKey: ['audit'],
    queryFn: async (): Promise<{ entries: AuditLog[]; lookups: AuditLookups }> => {
      const [entries, clients, profiles, jobs, complaints] = await Promise.all([
        sb
          .from('audit_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100)
          .then(({ data, error }) => {
            if (error) throw error;
            return (data ?? []) as AuditLog[];
          }),
        fetchAll<ClientLite>(() => sb.from('clients').select('id,company') as never),
        fetchAll<ProfileLite>(() => sb.from('profiles').select('id,full_name') as never),
        fetchAll<AuditJobLite>(
          () =>
            sb
              .from('jobs')
              .select('id,type,title,svc_internet,svc_webex,svc_nec,clients(company)') as never,
        ),
        fetchAll<ComplaintLite>(
          () => sb.from('complaints').select('id,complainant,tio_ref,clients(company)') as never,
        ),
      ]);
      return {
        entries,
        lookups: {
          clients: index(clients, (c) => c.company || ''),
          profiles: index(profiles, (p) => p.full_name || ''),
          jobs: index(jobs, jobLabel),
          complaints: index(
            complaints,
            (c) => `${c.clients?.company || 'Unknown'} · ${c.complainant || c.tio_ref || 'Complaint'}`,
          ),
        },
      };
    },
    staleTime: 30_000,
  });
}
