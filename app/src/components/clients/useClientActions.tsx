import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { sb } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import type { Site } from '../../lib/db.types';
import { useAuth } from '../../state/AuthProvider';
import { useModal } from '../../state/ModalProvider';
import { useToast } from '../../state/ToastProvider';
import { useClients } from '../../hooks/useClients';
import { ClientModal } from './ClientModal';
import { SiteModal } from './SiteModal';

/**
 * The client and site actions shared by the list and the profile: both modals and both
 * deletes, each refreshing whatever the caller is looking at.
 */
export function useClientActions() {
  const { user } = useAuth();
  const { openModal, closeModal } = useModal();
  const toast = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: allClients = [] } = useClients();

  const refreshClient = useCallback(
    (clientId: string) => {
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client', clientId] });
    },
    [queryClient],
  );

  const openClientModal = useCallback(
    (id?: string) => {
      openModal(
        <ClientModal
          id={id}
          allClients={allClients}
          currentUserId={user?.id ?? ''}
          onClose={closeModal}
          onSaved={refreshClient}
          onOpenClient={(cid) => navigate(`/client/${cid}`)}
        />,
      );
    },
    [allClients, closeModal, navigate, openModal, refreshClient, user],
  );

  const openSiteModal = useCallback(
    (clientId: string, site?: Site) => {
      openModal(
        <SiteModal
          clientId={clientId}
          site={site}
          onClose={closeModal}
          onSaved={() => refreshClient(clientId)}
        />,
      );
    },
    [closeModal, openModal, refreshClient],
  );

  const deleteClient = useCallback(
    async (id: string) => {
      if (!confirm('Delete this client and all their data?')) return;
      try {
        const { error } = await sb.from('clients').delete().eq('id', id);
        if (error) throw error;
        await logAudit('deleted', 'clients', id, {}, {});
        toast('Client deleted');
        void queryClient.invalidateQueries({ queryKey: ['clients'] });
        navigate('/clients');
      } catch (e) {
        toast(`Delete failed: ${(e as Error).message}`, 'error');
      }
    },
    [navigate, queryClient, toast],
  );

  const deleteSite = useCallback(
    async (id: string, clientId: string) => {
      if (!confirm('Delete this site?')) return;
      try {
        const { error } = await sb.from('sites').delete().eq('id', id);
        if (error) throw error;
        await logAudit('deleted', 'sites', id, {}, {});
        toast('Site deleted');
        refreshClient(clientId);
      } catch (e) {
        toast(`Delete failed: ${(e as Error).message}`, 'error');
      }
    },
    [refreshClient, toast],
  );

  const setPrimarySite = useCallback(
    async (site: Site) => {
      try {
        // Clear the outgoing primary first, or the unique index sees two at once
        const { data: cleared, error: cErr } = await sb
          .from('sites')
          .update({ is_primary: false })
          .eq('client_id', site.client_id)
          .eq('is_primary', true)
          .select('id,name');
        if (cErr) throw cErr;
        for (const o of cleared ?? [])
          await logAudit('updated', 'sites', o.id, { is_primary: true }, { name: o.name, is_primary: false });
        const { error } = await sb.from('sites').update({ is_primary: true }).eq('id', site.id);
        if (error) throw error;
        await logAudit('updated', 'sites', site.id, { is_primary: false }, { name: site.name, is_primary: true });
        toast(`${site.name} is now the primary site`);
      } catch (e) {
        toast(`Update failed: ${(e as Error).message}`, 'error');
      } finally {
        refreshClient(site.client_id);
      }
    },
    [refreshClient, toast],
  );

  return { openClientModal, openSiteModal, deleteClient, deleteSite, setPrimarySite };
}
