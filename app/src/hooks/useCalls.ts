import { useQuery } from '@tanstack/react-query';
import { sb } from '../lib/supabase';
import type { CallLog } from '../lib/db.types';

/** How many of a client's calls the Calls tab lists, newest first. */
const CALLS_SHOWN = 200;

/**
 * A client's answered calls, from the Webex call log. Admins and ops only: RLS returns nothing
 * to anyone else, so it is not asked for.
 */
export function useClientCalls(clientId: string | undefined, allowed: boolean) {
  return useQuery({
    queryKey: ['callLog', clientId],
    enabled: !!clientId && allowed,
    queryFn: async () => {
      const { data, error } = await sb
        .from('call_log')
        .select('*')
        .contains('client_ids', [clientId!])
        .order('answered_at', { ascending: false })
        .limit(CALLS_SHOWN);
      if (error) throw error;
      return (data ?? []) as CallLog[];
    },
  });
}
