import type { Job } from './db.types';

export type JobKind = 'installs' | 'service';

export const JOB_KINDS = {
  installs: {
    heading: 'New installs',
    noun: 'new install',
    draft: 'New install',
    empty: 'No new installs found.',
    icon: 'ti-tool',
  },
  service: {
    heading: 'Service tickets',
    noun: 'service ticket',
    draft: 'New service ticket',
    empty: 'No service tickets found.',
    icon: 'ti-headset',
  },
} as const;

/** Anything that is not a New Install is a service ticket, matching the old tab split. */
export const jobKindOf = (j: Pick<Job, 'type'>): JobKind =>
  j.type === 'New Install' ? 'installs' : 'service';

/** Services ticked on a New Install (the deal); the sales dashboard counts these. */
export const JOB_SVCS = [
  ['svc_internet', 'Internet'],
  ['svc_webex', 'Webex'],
  ['svc_nec', 'NEC'],
] as const;
