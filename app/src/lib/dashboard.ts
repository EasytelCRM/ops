import { useSyncExternalStore } from 'react';
import { localYmd } from './format';
import type { ServiceFlags } from './db.types';

/**
 * A deal is a New Install (not a legacy one), won on its approval date. Installs logged
 * before approval dates were recorded fall back to the day they were created.
 */
export type Deal = ServiceFlags & {
  id: string;
  status: string | null;
  approval_date: string | null;
  created_at: string | null;
  clients: { company: string | null } | null;
};

/** Deals were only logged in the CRM from May 2026, so earlier periods would compare against near-empty months. */
export const DASH_DEALS_FROM = '2026-05-01';

export const dealDate = (j: Deal) =>
  j.approval_date || (j.created_at ? localYmd(new Date(j.created_at)) : '');

export const dashMonth = (d: Date, fmt: 'long' | 'short' = 'long') =>
  d.toLocaleDateString('en-AU', { month: fmt });

/**
 * The same point in month m: day d kept inside that month (31 Oct → 30 Sep), or its last
 * day when today is the end of a month (30 Nov → 31 Oct).
 */
export const dashDay = (y: number, m: number, d: number, monthEnd: boolean) =>
  new Date(y, m, monthEnd ? new Date(y, m + 1, 0).getDate() : Math.min(d, new Date(y, m + 1, 0).getDate()));

export type DashPeriod = 'month' | 'last' | 'quarter' | 'fy';

export interface DashRange {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  label: string;
  prevLabel: string;
}

/**
 * The selected period and the one it is compared with. A period still under way is
 * compared with the same point in the previous one, so a half-finished quarter does not
 * always look down.
 */
export function dashRange(p: DashPeriod, today: Date): DashRange {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  const end = d === new Date(y, m + 1, 0).getDate();
  if (p === 'last')
    return {
      from: new Date(y, m - 1, 1),
      to: new Date(y, m, 0),
      prevFrom: new Date(y, m - 2, 1),
      prevTo: new Date(y, m - 1, 0),
      label: dashMonth(new Date(y, m - 1, 1)),
      prevLabel: dashMonth(new Date(y, m - 2, 1)),
    };
  if (p === 'quarter') {
    const qm = m - (m % 3);
    const from = new Date(y, qm, 1);
    return {
      from,
      to: today,
      prevFrom: new Date(y, qm - 3, 1),
      prevTo: dashDay(y, m - 3, d, end),
      label: `${dashMonth(from, 'short')} to ${dashMonth(new Date(y, qm + 2, 1), 'short')} quarter`,
      prevLabel: 'this point last quarter',
    };
  }
  if (p === 'fy') {
    const fy = m >= 6 ? y : y - 1;
    return {
      from: new Date(fy, 6, 1),
      to: today,
      prevFrom: new Date(fy - 1, 6, 1),
      prevTo: dashDay(y - 1, m, d, end),
      label: `FY ${fy}–${String(fy + 1).slice(2)}`,
      prevLabel: 'this point last year',
    };
  }
  return {
    from: new Date(y, m, 1),
    to: today,
    prevFrom: new Date(y, m - 1, 1),
    prevTo: dashDay(y, m - 1, d, end),
    label: dashMonth(today),
    prevLabel: `this point in ${dashMonth(new Date(y, m - 1, 1))}`,
  };
}

export const dashCount = (deals: Deal[], from: Date, to: Date) => {
  const a = localYmd(from);
  const b = localYmd(to);
  return deals.filter((j) => {
    const dd = dealDate(j);
    return dd >= a && dd <= b;
  });
};

export function dashCompare(n: number, prev: Deal[], prevLabel: string, prevFrom: Date) {
  if (localYmd(prevFrom) < DASH_DEALS_FROM)
    return { text: 'Not enough history to compare', cls: '' };
  const diff = n - prev.length;
  if (!diff) return { text: `Same as ${prevLabel} (${prev.length})`, cls: '' };
  return {
    text: `${diff > 0 ? 'Up' : 'Down'} ${Math.abs(diff)} on ${prevLabel} (${prev.length})`,
    cls: diff > 0 ? 'up' : 'down',
  };
}

/** The chosen period outlives the page, as the single-file app's module-level one did. */
let period: DashPeriod = 'month';
const listeners = new Set<() => void>();

export function setDashPeriod(p: DashPeriod) {
  period = p;
  listeners.forEach((l) => l());
}

export const useDashPeriod = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => period,
  );
