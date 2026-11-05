import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { sb } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import { safeTicketUrl } from '../Links';
import {
  confirmPortingTicketNo,
  reqFromTicketUrl,
  resolvePortingTicketNo,
  type PortingRow,
} from '../../lib/porting';
import {
  formFromPorting,
  getPorting,
  setPorting,
  type PortingForm,
} from '../../lib/portingPane';
import { isAdminOrOps } from '../../lib/roles';
import { useAuth } from '../../state/AuthProvider';
import { useModal } from '../../state/ModalProvider';
import { useToast } from '../../state/ToastProvider';
import type { PortingData } from '../../hooks/usePorting';
import type { Porting } from '../../lib/db.types';

/** Everything the Porting pane does: selection, the draft, saving and deleting. */
export function usePortingActions(data: PortingData | undefined) {
  const { profile, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirmDiscard } = useModal();

  const ports = data?.ports ?? [];
  const recOf = (id: string | null) => ports.find((p) => p.id === id) ?? null;

  const confirmDiscardPorting = async () => {
    if (!getPorting().dirty) return true;
    return confirmDiscard('You have unsaved changes to this ticket. Discard them?');
  };

  const openRecord = (rec: PortingRow) =>
    setPorting({
      sel: rec.id,
      draft: false,
      dirty: false,
      error: '',
      urlHint: '',
      form: formFromPorting(rec, null),
      formFor: rec.id,
    });

  const selectPorting = async (id: string) => {
    const rec = recOf(id);
    if (!rec) return;
    if (!(await confirmDiscardPorting())) return;
    openRecord(rec);
  };

  const newDraft = async (clientId?: string) => {
    if (!isAdminOrOps(profile)) return; // porting is read-only for techs
    if (!(await confirmDiscardPorting())) return;
    setPorting({
      sel: null,
      draft: true,
      dirty: false,
      error: '',
      urlHint: '',
      form: formFromPorting(null, clientId ?? null),
      formFor: '',
    });
  };

  const cancelDraft = () =>
    setPorting({ draft: false, dirty: false, error: '', urlHint: '', form: null, formFor: null });

  const setField = <K extends keyof PortingForm>(field: K, value: PortingForm[K]) => {
    const s = getPorting();
    if (!s.form) return;
    setPorting({ form: { ...s.form, [field]: value }, dirty: true });
  };

  /** Pasting a link fills the ticket number; the number stays editable for links without a REQ. */
  const setTicketUrl = (url: string) => {
    const s = getPorting();
    if (!s.form) return;
    const req = reqFromTicketUrl(url);
    setPorting({
      form: { ...s.form, ticket_url: url, ...(req ? { phone_numbers: req } : {}) },
      dirty: true,
      urlHint:
        url.trim() && !req ? 'No REQ number found in this link. Type the ticket number in yourself.' : '',
    });
  };

  const openClient = async (clientId: string) => {
    if (!(await confirmDiscardPorting())) return;
    navigate(`/client/${clientId}`);
  };

  const deletePorting = async (id: string) => {
    if (!confirm('Delete this porting ticket?')) return;
    try {
      const { error } = await sb.from('porting').delete().eq('id', id);
      if (error) throw error;
      await logAudit('deleted', 'porting', id, {}, {});
      setPorting({ sel: null, draft: false, dirty: false, form: null, formFor: null });
      void queryClient.invalidateQueries({ queryKey: ['porting'] });
      toast('Porting ticket deleted');
    } catch (e) {
      toast(`Delete failed: ${(e as Error).message}`, 'error');
    }
  };

  const savePorting = async () => {
    const s = getPorting();
    if (s.saving || !s.form) return;
    const f = s.form;
    const rec = s.draft ? null : recOf(s.sel);
    if (!rec && !s.draft) return;

    const url = f.ticket_url.trim() || null;
    const carrier = f.losing_carrier.trim();
    const clientId = s.draft ? f.client_id : rec!.client_id;
    const numbers = resolvePortingTicketNo(f.phone_numbers.trim(), f.status);

    const fail = (m: string) => setPorting({ error: m });
    setPorting({ error: '' });
    if (s.draft && !clientId) return fail('Please select a client.');
    if (!numbers) return fail('Ticket number is required unless the port is still Pending.');
    if (url && !safeTicketUrl(url)) return fail('Ticket link must start with http:// or https://.');
    if (!carrier) return fail('Losing carrier is required.');

    setPorting({ saving: true });
    try {
      if (numbers !== rec?.phone_numbers && !(await confirmPortingTicketNo(numbers, rec?.id))) return;
      const payload: Partial<Porting> = {
        phone_numbers: numbers,
        ticket_url: url,
        losing_carrier: carrier,
        port_date: f.port_date || null,
        port_time: f.port_time || null,
        status: f.status,
        notes: f.notes.trim() || null,
      };
      let saved: PortingRow;
      if (rec) {
        // Capture the pre-edit values so the audit log can show a real field-level diff
        const oldData = {
          phone_numbers: rec.phone_numbers,
          ticket_url: rec.ticket_url,
          losing_carrier: rec.losing_carrier,
          port_date: rec.port_date,
          port_time: rec.port_time,
          status: rec.status,
          notes: rec.notes,
        };
        const { error } = await sb.from('porting').update(payload).eq('id', rec.id);
        if (error) throw error;
        await logAudit('updated', 'porting', rec.id, oldData, payload);
        saved = { ...rec, ...payload };
        toast('Porting ticket updated');
      } else {
        const { data: row, error } = await sb
          .from('porting')
          .insert({ ...payload, client_id: clientId, created_by: user?.id })
          .select('*,clients(company,account_number)')
          .single();
        if (error) throw error;
        saved = row as unknown as PortingRow;
        await logAudit('created', 'porting', saved.id, {}, { ...payload, client_id: clientId });
        toast('Porting ticket created');
      }
      setPorting({
        sel: saved.id,
        draft: false,
        dirty: false,
        error: '',
        urlHint: '',
        form: formFromPorting(saved, null),
        formFor: saved.id,
      });
      void queryClient.invalidateQueries({ queryKey: ['porting'] });
      void queryClient.invalidateQueries({ queryKey: ['client', saved.client_id] });
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`, 'error');
    } finally {
      setPorting({ saving: false });
    }
    return undefined;
  };

  return {
    confirmDiscardPorting,
    openRecord,
    selectPorting,
    newDraft,
    cancelDraft,
    setField,
    setTicketUrl,
    openClient,
    deletePorting,
    savePorting,
  };
}
