import { Fragment, type ReactNode } from 'react';
import type { Client } from './db.types';

/** Three separate cards, each edited and saved on its own. */
export const CRED_FIELDS = [
  {
    k: 'router',
    col: 'cred_router',
    label: 'Router',
    icon: 'ti-router',
    ph: 'Router URL, password...',
  },
  {
    k: 'phone',
    col: 'cred_phone_system',
    label: 'Phone System',
    icon: 'ti-phone',
    ph: 'Phone system URL, username, password...',
  },
  { k: 'other', col: 'cred_other', label: 'Other', icon: 'ti-key', ph: 'Any other logins, IPs, notes...' },
] as const satisfies readonly {
  k: string;
  col: keyof Client;
  label: string;
  icon: string;
  ph: string;
}[];

export type CredField = (typeof CRED_FIELDS)[number];

export const credField = (k: string) => CRED_FIELDS.find((f) => f.k === k);

const URL_RE = /https?:\/\/[^\s<]+/gi;

/** Turns http(s) URLs into links; trailing punctuation stays outside the link. */
export function Linkify({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const whole = m[0];
    const at = m.index;
    const url = whole.replace(/[.,;:!?)]+$/, '');
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <Fragment key={at}>
        <a href={url} target="_blank" rel="noopener">
          {url}
        </a>
        {whole.slice(url.length)}
      </Fragment>,
    );
    last = at + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
