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

/** The office closes at 5pm, when After Hours calls begin; each night is counted up to 5pm the next day. */
const CLOSE_HOUR = 17;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const at5pm = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), CLOSE_HOUR);
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

/** The latest weekday (Mon–Fri) before `d`. */
function prevWeekday(d: Date): Date {
  let p = addDays(d, -1);
  while (isWeekend(p)) p = addDays(p, -1);
  return p;
}

/**
 * The night that ends on day `d`, the way the After Hours team reads it: from 5pm on the last
 * weekday before it until 5pm on `d`. Fri 20 Nov is Thu 5pm → Fri 5pm; Monday (and a Saturday
 * or Sunday picked on the page) runs from Friday 5pm, so Monday's view holds the whole weekend.
 * Ending at 5pm, not at opening time, keeps it independent of the Webex schedule: only calls
 * outside business hours reach the queue.
 */
export function nightRange(d: Date): { from: Date; to: Date } {
  return { from: at5pm(prevWeekday(d)), to: at5pm(d) };
}

/**
 * A period as [from, to) in the browser's own timezone, made of nights (see nightRange).
 * "Today" is the night ending today, and stays on it after 5pm (tonight's calls belong to
 * tomorrow). "Yesterday" is the night before that, so on a Monday it is Thursday → Friday rather
 * than the weekend again. `day` is a YYYY-MM-DD picked on the page.
 */
export function queueRange(p: QueuePeriod, day: string, now = new Date()): { from: Date; to: Date } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (p) {
    case 'today':
      return nightRange(today);
    case 'yesterday':
      return nightRange(nightRange(today).from);
    case 'last7':
      return { from: at5pm(addDays(today, -7)), to: at5pm(today) };
    case 'month':
      // From 5pm on the last day of the previous month: the night into the 1st counts here
      return { from: at5pm(addDays(new Date(now.getFullYear(), now.getMonth(), 1), -1)), to: at5pm(today) };
    case 'day': {
      const [y, m, d] = day.split('-').map(Number);
      return nightRange(new Date(y, m - 1, d));
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
