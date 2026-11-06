import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { sb } from './supabase';

/**
 * Live updates: when anyone saves, everyone else's open screens refresh.
 *
 * Supabase Realtime sends a change event for each of these tables (they are in the
 * supabase_realtime publication, and RLS still decides who receives inserts/updates).
 * Each event marks the queries that show that table as stale. Only the queries that are
 * on screen re-download; the rest refresh the next time they are opened.
 *
 * Unsaved work is safe: the job, porting and complaint panes only re-seed a form that
 * is not dirty, and the client modal reads its record once when it opens.
 */
const AFFECTS: Record<string, string[]> = {
  clients: ['clients', 'client', 'jobs', 'porting', 'complaints', 'dashboard'],
  client_contacts: ['clients', 'client'],
  client_notes: ['clientNotes', 'client'],
  sites: ['client', 'jobs'],
  jobs: ['jobs', 'dashboard', 'client', 'clients'],
  job_notes: ['jobNotes', 'jobs'],
  porting: ['porting', 'client'],
  complaints: ['complaints', 'client'],
  complaint_notes: ['complaintNotes', 'complaints'],
  profiles: ['profiles'],
};

/** A burst of saves (a multi-row edit, an import) becomes one refresh. */
const DEBOUNCE_MS = 500;

function makeBatcher(queryClient: QueryClient) {
  const pending = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    add(keys: string[]) {
      keys.forEach((k) => pending.add(k));
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const keys = [...pending];
        pending.clear();
        keys.forEach((k) => void queryClient.invalidateQueries({ queryKey: [k] }));
      }, DEBOUNCE_MS);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
    },
  };
}

/** Mount once inside the signed-in app shell. */
export function useLiveUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const batch = makeBatcher(queryClient);
    let dropped = false;

    // A unique name per mount: supabase-js hands back an existing channel with the same
    // name, and React's dev double-mount would then add listeners to one already subscribed.
    let channel = sb.channel(`crm-live-${crypto.randomUUID()}`);
    for (const table of Object.keys(AFFECTS)) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () =>
        batch.add(AFFECTS[table]),
      );
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        // Back after a drop (sleep, wifi): anything saved meanwhile was never sent,
        // so refresh everything rather than guess what was missed.
        if (dropped) void queryClient.invalidateQueries();
        dropped = false;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        dropped = true;
      }
    });

    return () => {
      batch.cancel();
      void sb.removeChannel(channel);
    };
  }, [queryClient]);
}
