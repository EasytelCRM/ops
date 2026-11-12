import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { indexNotes, JOB_SELECT, type ClientLite, type JobRow, type SiteLite } from '../lib/jobs';
import type { JobNote } from '../lib/db.types';

export interface JobsData {
  jobs: JobRow[];
  /** Lightweight list for the detail pane's client dropdown. */
  clients: ClientLite[];
  /** Every site, so the pane can filter by client without a refetch. */
  sites: SiteLite[];
  /** job id → all its notes' text, lowercased, for the list search. */
  noteIndex: Record<string, string>;
  /** The index has loaded at least once, so a missing entry really means no notes. */
  noteIndexReady: boolean;
}

/**
 * Everything both job pages read, in one unit — the same five requests the single-file
 * app fired together in loadJobs, so the sync dot still ticks once per refresh.
 */
export function useJobsData() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['jobs'],
    queryFn: async (): Promise<JobsData> => {
      const [jobs, clients, sites, noteRows] = await Promise.all([
        fetchAll<JobRow>(() =>
          sb.from('jobs').select(JOB_SELECT).order('due_date', {
            ascending: true,
            nullsFirst: false,
          }) as never,
        ),
        fetchAll<ClientLite>(() => sb.from('clients').select('id,company,cancelled_date').order('company') as never),
        // Primary first, so it heads each client's site picker
        fetchAll<SiteLite>(
          () =>
            sb
              .from('sites')
              .select('id,name,client_id')
              .order('is_primary', { ascending: false })
              .order('created_at', { ascending: true })
              .order('id') as never, // a unique last key keeps the pages stable
        ),
        // Search only: a failure keeps the index from the last load rather than
        // flagging every install as having no notes.
        fetchAll<Pick<JobNote, 'job_id' | 'text'>>(() =>
          sb.from('job_notes').select('job_id,text').order('created_at') as never,
        ).catch(() => null),
      ]);
      const prev = queryClient.getQueryData<JobsData>(['jobs']);
      return {
        jobs,
        clients,
        sites,
        noteIndex: noteRows ? indexNotes(noteRows, 'job_id') : (prev?.noteIndex ?? {}),
        noteIndexReady: noteRows ? true : (prev?.noteIndexReady ?? false),
      };
    },
  });
}

export type JobNoteRow = JobNote & { profiles: { full_name: string | null } | null };

/** One job's note log, newest first. */
export function useJobNotes(jobId: string | null) {
  return useQuery({
    queryKey: ['jobNotes', jobId],
    enabled: !!jobId,
    queryFn: async () => {
      const { data, error } = await sb
        .from('job_notes')
        .select('*,profiles(full_name)')
        .eq('job_id', jobId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as JobNoteRow[];
    },
  });
}
