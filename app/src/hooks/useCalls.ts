import { useQuery } from '@tanstack/react-query';
import { sb } from '../lib/supabase';
import type { CallLog } from '../lib/db.types';

/**
 * A client's answered calls (newest 200), from the Webex call log. client_calls() matches on
 * the client's numbers as they are now — main phone plus contacts' phone and mobile — so a
 * number added or removed re-files the calls at once. Admins and ops only: the function
 * refuses anyone else, so it is not asked for.
 *
 * Refreshes on call_log, clients and client_contacts changes (realtime.ts), since a new call
 * or an edited number can both change the list.
 */
export function useClientCalls(clientId: string | undefined, allowed: boolean) {
  return useQuery({
    queryKey: ['callLog', clientId],
    enabled: !!clientId && allowed,
    queryFn: async () => {
      const { data, error } = await sb.rpc('client_calls', { p_client: clientId! });
      if (error) throw error;
      return (data ?? []) as CallLog[];
    },
  });
}
