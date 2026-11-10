import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { sb } from '../lib/supabase';
import type { CallStatsRow, WebexUser } from '../lib/db.types';

export type Period = 'today' | 'yesterday' | 'week' | 'month';

export const PERIODS: { p: Period; label: string }[] = [
  { p: 'today', label: 'Today' },
  { p: 'yesterday', label: 'Yesterday' },
  { p: 'week', label: 'This week' },
  { p: 'month', label: 'This month' },
];

/**
 * A period as [from, to) in the browser's own timezone — Sydney on the office TV.
 * Weeks start on Monday.
 */
export function periodRange(p: Period, now = new Date()): { from: Date; to: Date } {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  switch (p) {
    case 'today':
      return { from: midnight, to: addDays(midnight, 1) };
    case 'yesterday':
      return { from: addDays(midnight, -1), to: midnight };
    case 'week':
      return { from: addDays(midnight, -((midnight.getDay() + 6) % 7)), to: addDays(midnight, 1) };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: addDays(midnight, 1) };
  }
}

/**
 * The sales team's call stats for a period. Live: call_legs changes refresh it over
 * Realtime (see realtime.ts), and a slow poll keeps it right if a change is missed and
 * rolls "today" over at midnight.
 */
export function useCallStats(period: Period) {
  const day = new Date().toDateString(); // re-keys the query when the date changes
  return useQuery({
    queryKey: ['callStats', period, day],
    queryFn: async () => {
      const { from, to } = periodRange(period);
      const { data, error } = await sb.rpc('call_stats', { p_from: from.toISOString(), p_to: to.toISOString() });
      if (error) throw error;
      return (data ?? []) as CallStatsRow[];
    },
    refetchInterval: 60_000,
  });
}

/** Everyone on Webex, for choosing the sales team. Admin-only. */
export function useWebexUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['webexUsers'],
    enabled,
    queryFn: async () => {
      const { data, error } = await sb.from('webex_users').select('*').order('label');
      if (error) throw error;
      return (data ?? []) as WebexUser[];
    },
  });
}

/** Puts someone on, or takes them off, the sales team board. */
export function useSetSales() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sales }: { id: string; sales: boolean }) => {
      const { error } = await sb.from('webex_users').update({ sales }).eq('webex_person_id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['webexUsers'] });
      void qc.invalidateQueries({ queryKey: ['callStats'] });
    },
  });
}
