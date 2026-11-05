import { useQuery } from '@tanstack/react-query';
import { sb } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { JOB_SELECT, type JobRow } from '../lib/jobs';
import type { Deal } from '../lib/dashboard';

export interface DashboardData {
  /** Every open install, for the Pending and Incomplete cards. */
  openInstalls: JobRow[];
  /** Every non-legacy install, for the sales figures. */
  deals: Deal[];
}

export function useDashboardData() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<DashboardData> => {
      const [openInstalls, deals] = await Promise.all([
        fetchAll<JobRow>(() =>
          sb
            .from('jobs')
            .select(JOB_SELECT)
            .eq('type', 'New Install')
            .in('status', ['Pending', 'Incomplete'])
            .order('approval_date', { ascending: true, nullsFirst: false }) as never,
        ),
        fetchAll<Deal>(() =>
          sb
            .from('jobs')
            .select('id,status,approval_date,created_at,svc_internet,svc_webex,svc_nec,clients(company)')
            .eq('type', 'New Install')
            .eq('legacy', false) as never,
        ),
      ]);
      return { openInstalls, deals };
    },
  });
}
