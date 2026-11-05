import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sb } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import { useToast } from '../../state/ToastProvider';

/**
 * Deleting a job, porting ticket or complaint from the client profile's tabs. The
 * detail panes on their own pages get the same actions in Phases 3 and 4.
 */
export function useRecordDeletes(clientId: string | undefined) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['client', clientId] });
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
  }, [clientId, queryClient]);

  const deleteJob = useCallback(
    async (id: string) => {
      if (!confirm('Delete this job?')) return;
      try {
        const { error } = await sb.from('jobs').delete().eq('id', id);
        if (error) throw error;
        await logAudit('deleted', 'jobs', id, {}, {});
        toast('Job deleted');
        refresh();
      } catch (e) {
        toast(`Delete failed: ${(e as Error).message}`, 'error');
      }
    },
    [refresh, toast],
  );

  const deletePorting = useCallback(
    async (id: string) => {
      if (!confirm('Delete this porting ticket?')) return;
      try {
        const { error } = await sb.from('porting').delete().eq('id', id);
        if (error) throw error;
        await logAudit('deleted', 'porting', id, {}, {});
        toast('Porting ticket deleted');
        refresh();
      } catch (e) {
        toast(`Delete failed: ${(e as Error).message}`, 'error');
      }
    },
    [refresh, toast],
  );

  const deleteComplaint = useCallback(
    async (id: string) => {
      if (!confirm('Delete this complaint and all its notes?')) return;
      try {
        // RLS silently drops a delete it refuses, so ask for the row back to tell the two apart
        const { data, error } = await sb.from('complaints').delete().eq('id', id).select('id');
        if (error) throw error;
        if (!data?.length) throw new Error('only admins can delete complaints');
        await logAudit('deleted', 'complaints', id, {}, {});
        toast('Complaint deleted');
        refresh();
      } catch (e) {
        toast(`Delete failed: ${(e as Error).message}`, 'error');
      }
    },
    [refresh, toast],
  );

  return { deleteJob, deletePorting, deleteComplaint };
}
