import { useQuery } from '@tanstack/react-query';
import { sb } from '../lib/supabase';
import type { QueueCall } from '../lib/db.types';

/** The "Easytel After Hours" Webex call queue (Ext 621). Matched by number so a rename in Webex doesn't break it. */
export const AFTER_HOURS_QUEUE = '0290584342';

export type QueuePeriod = 'today' | 'yesterday' | 'last7' | 'month' | 'day';

export const QUEUE_PERIODS: { p: Exclude<QueuePeriod, 'day'>; label: string }[] = [
  { p: 'today', label: 'Today' },
  { p: 'yesterday', label: 'Yesterday' },
  { p: 'last7', label: 'Last 7 days' },
  { p: 'month', label: 'This month' },
];

/**
 * A period as [from, to) in the browser's own timezone. `day` is a YYYY-MM-DD picked on the
 * page; "last 7 days" is today and the six days before, so a Monday still shows the weekend.
 */
export function queueRange(p: QueuePeriod, day: string, now = new Date()): { from: Date; to: Date } {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  switch (p) {
    case 'today':
      return { from: midnight, to: addDays(midnight, 1) };
    case 'yesterday':
      return { from: addDays(midnight, -1), to: midnight };
    case 'last7':
      return { from: addDays(midnight, -6), to: addDays(midnight, 1) };
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: addDays(midnight, 1) };
    case 'day': {
      const [y, m, d] = day.split('-').map(Number);
      const from = new Date(y, m - 1, d);
      return { from, to: addDays(from, 1) };
    }
  }
}

/**
 * The calls a Webex queue offered in a period, one row per call. Live: call_legs changes
 * refresh it over Realtime (see realtime.ts); the slow poll covers a missed event and rolls
 * "today" over at midnight.
 */
export function useQueueCalls(queue: string, period: QueuePeriod, day: string) {
  const today = new Date().toDateString(); // re-keys the query when the date changes
  return useQuery({
    queryKey: ['queueCalls', queue, period, period === 'day' ? day : '', today],
    enabled: period !== 'day' || /^\d{4}-\d{2}-\d{2}$/.test(day),
    queryFn: async () => {
      const { from, to } = queueRange(period, day);
      const { data, error } = await sb.rpc('queue_calls', {
        p_queue_number: queue,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw error;
      return (data ?? []) as QueueCall[];
    },
    refetchInterval: 60_000,
  });
}
