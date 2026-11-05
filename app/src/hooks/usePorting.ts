import { useQuery } from '@tanstack/react-query';
import { sb } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { PORTING_SELECT, sortPorting, type PortingRow } from '../lib/porting';
import type { ClientLite } from '../lib/jobs';

export interface PortingData {
  ports: PortingRow[];
  clients: ClientLite[];
}

/** The Porting page's two requests, fired together as loadPorting did. */
export function usePortingData() {
  return useQuery({
    queryKey: ['porting'],
    queryFn: async (): Promise<PortingData> => {
      const [ports, clients] = await Promise.all([
        fetchAll<PortingRow>(() =>
          sb
            .from('porting')
            .select(PORTING_SELECT)
            .order('port_date', { ascending: true, nullsFirst: false })
            .order('port_time', { ascending: true, nullsFirst: false }) as never,
        ),
        fetchAll<ClientLite>(() => sb.from('clients').select('id,company').order('company') as never),
      ]);
      // The fetch orders by date; TBC tickets still need lifting to the top
      return { ports: sortPorting(ports), clients };
    },
  });
}
