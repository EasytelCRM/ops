import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sb } from './supabase';
import { hasUnsavedWork } from './unsavedWork';
import type { ScreenPop } from './db.types';
import { useAuth } from '../state/AuthProvider';
import { useModal } from '../state/ModalProvider';
import { useToast } from '../state/ToastProvider';

/**
 * Screen pop: when this user answers a call on Webex, open the caller's client.
 *
 * The webex-call-event Edge Function writes a screen_pops row for the agent who answered
 * (only for people switched on in webex_users). RLS lets each user read only their own,
 * and Realtime delivers the insert here.
 *
 * - One matching client and nothing half-done on screen → go straight to it.
 * - A modal open, unsaved work, or a half-typed note → don't jump; the call bar offers it.
 * - Several clients share the number → the call bar lists them.
 * - Unknown or withheld number → the call bar offers a client search.
 *
 * With the CRM open in several tabs, only the one used last reacts.
 */

export interface PopClient {
  id: string;
  company: string;
  cancelled: boolean;
}

export interface ActivePop {
  id: string;
  number: string | null;
  callerName: string | null;
  clients: PopClient[];
  /** The CRM went straight to the (single) client. */
  opened: boolean;
}

/** Pops older than this (a tab waking from sleep, a slow reconnect) are stale: ignore them. */
const MAX_AGE_MS = 2 * 60_000;
/** A bar for a client that was opened for you clears itself after this. */
const OPENED_BAR_MS = 30_000;

// ── Which tab reacts: the one focused most recently ────────────────────────────
const TAB_KEY = 'tcrm_screenpop_tab';
const tabId = crypto.randomUUID();

function claimTab() {
  try {
    localStorage.setItem(TAB_KEY, tabId);
  } catch {
    /* private window: every tab reacts, which is still correct for one tab */
  }
}

function isLeadTab() {
  try {
    const lead = localStorage.getItem(TAB_KEY);
    return !lead || lead === tabId;
  } catch {
    return true;
  }
}

/**
 * A client note being typed is not registered as unsaved work (the compose box lives on
 * the client page), but leaving that page would lose it.
 */
function typingANote() {
  return [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('.jn-compose textarea, .cln-title-in')].some(
    (el) => el.value.trim() !== '',
  );
}

// ── Desktop alerts, for when the CRM is in a background tab ────────────────────
export const canAskForAlerts = () => 'Notification' in window && Notification.permission === 'default';

export async function askForAlerts() {
  if ('Notification' in window) await Notification.requestPermission();
}

function alertIfHidden(title: string, body: string, tag: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const n = new Notification(title, { body, tag });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker; the bar still shows */
  }
}

export function popHeadline(p: Pick<ActivePop, 'number' | 'clients'>) {
  if (p.clients.length === 1) return p.clients[0].company;
  if (p.clients.length > 1) return `${p.number} (${p.clients.length} clients)`;
  return p.number ? `Unknown caller ${p.number}` : 'Withheld number';
}

/** Mount once inside the signed-in app shell. */
export function useScreenPop() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { isModalOpen } = useModal();
  const [pop, setPop] = useState<ActivePop | null>(null);

  const modalOpen = useRef(isModalOpen);
  modalOpen.current = isModalOpen;

  // The tab you open or come back to is the one that reacts
  useEffect(() => {
    claimTab();
    const onFocus = () => claimTab();
    const onVisible = () => {
      if (!document.hidden) claimTab();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handle = useCallback(
    async (row: ScreenPop) => {
      if (Date.now() - new Date(row.created_at).getTime() > MAX_AGE_MS) return;
      if (!isLeadTab()) return;

      let clients: PopClient[] = [];
      if (row.client_ids.length) {
        const { data } = await sb.from('clients').select('id,company,cancelled_date').in('id', row.client_ids);
        clients = (data ?? [])
          .map((c) => ({ id: c.id, company: c.company, cancelled: !!c.cancelled_date }))
          // Current clients first
          .sort((a, b) => Number(a.cancelled) - Number(b.cancelled) || a.company.localeCompare(b.company));
      }

      const busy = modalOpen.current || hasUnsavedWork() || typingANote();
      const opened = clients.length === 1 && !busy;
      if (opened) navigate(`/client/${clients[0].id}`);

      const next: ActivePop = { id: row.id, number: row.number, callerName: row.caller_name, clients, opened };
      setPop(next);
      alertIfHidden(
        `Call: ${popHeadline(next)}`,
        opened ? 'Opened in the CRM' : 'Click to see it in the CRM',
        row.webex_call_id,
      );
    },
    [navigate],
  );

  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    // A unique name per mount, as in realtime.ts: StrictMode's double mount must not
    // add listeners to a channel that is already subscribed.
    const channel = sb
      .channel(`screen-pop-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'screen_pops', filter: `profile_id=eq.${uid}` },
        (payload) => void handleRef.current(payload.new as ScreenPop),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [user?.id]);

  // A bar for a client already on screen only needs to be seen, not dealt with
  useEffect(() => {
    if (!pop?.opened) return;
    const t = setTimeout(() => setPop((p) => (p?.id === pop.id ? null : p)), OPENED_BAR_MS);
    return () => clearTimeout(t);
  }, [pop]);

  const dismiss = useCallback(() => setPop(null), []);

  const openClient = useCallback(
    (id: string) => {
      if (modalOpen.current) {
        toast('Finish or close the open form first', 'warn');
        return;
      }
      navigate(`/client/${id}`);
      setPop(null);
    },
    [navigate, toast],
  );

  const searchClients = useCallback(
    (q: string) => {
      if (modalOpen.current) {
        toast('Finish or close the open form first', 'warn');
        return;
      }
      navigate('/clients', { state: { q } });
      setPop(null);
    },
    [navigate, toast],
  );

  return { pop, dismiss, openClient, searchClients };
}
