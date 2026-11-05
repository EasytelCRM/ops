import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sb } from '../lib/supabase';
import { fetchAll } from '../lib/fetchAll';
import { indexNotes } from '../lib/jobs';
import { COMPLAINT_SELECT, type ComplaintRow } from '../lib/complaintPane';
import type { ClientLite } from '../lib/jobs';
import type { ComplaintNote } from '../lib/db.types';

export interface ComplaintsData {
  complaints: ComplaintRow[];
  clients: ClientLite[];
  /** complaint id → all its notes' text, lowercased, for the list search. */
  noteIndex: Record<string, string>;
}

/** The Complaints page's requests, fired together as loadComplaints did. */
export function useComplaintsData() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['complaints'],
    queryFn: async (): Promise<ComplaintsData> => {
      const [complaints, clients, noteRows] = await Promise.all([
        fetchAll<ComplaintRow>(() =>
          sb
            .from('complaints')
            .select(COMPLAINT_SELECT)
            .order('open_date', { ascending: false })
            .order('created_at', { ascending: false }) as never,
        ),
        fetchAll<ClientLite>(() => sb.from('clients').select('id,company').order('company') as never),
        // Search only: a failure keeps the index from the last load
        fetchAll<Pick<ComplaintNote, 'complaint_id' | 'text'>>(() =>
          sb.from('complaint_notes').select('complaint_id,text').order('created_at') as never,
        ).catch(() => null),
      ]);
      const prev = queryClient.getQueryData<ComplaintsData>(['complaints']);
      return {
        complaints,
        clients,
        noteIndex: noteRows ? indexNotes(noteRows, 'complaint_id') : (prev?.noteIndex ?? {}),
      };
    },
  });
}

export type ComplaintNoteRow = ComplaintNote & { profiles: { full_name: string | null } | null };

/** One complaint's note log, newest first. */
export function useComplaintNotes(complaintId: string | null) {
  return useQuery({
    queryKey: ['complaintNotes', complaintId],
    enabled: !!complaintId,
    queryFn: async () => {
      const { data, error } = await sb
        .from('complaint_notes')
        .select('*,profiles(full_name)')
        .eq('complaint_id', complaintId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ComplaintNoteRow[];
    },
  });
}
