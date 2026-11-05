import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { sb } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import { today } from '../../lib/format';
import {
  COMPLAINT_SELECT,
  formFromComplaint,
  getComplaint,
  setComplaint,
  type ComplaintForm,
  type ComplaintRow,
} from '../../lib/complaintPane';
import { useAuth } from '../../state/AuthProvider';
import { useModal } from '../../state/ModalProvider';
import { useToast } from '../../state/ToastProvider';
import { insertComplaintNote } from './ComplaintNotes';
import type { ComplaintsData } from '../../hooks/useComplaints';
import type { Complaint } from '../../lib/db.types';

/** Everything the Complaints pane does: selection, the draft, notes-aware saving, deleting. */
export function useComplaintActions(data: ComplaintsData | undefined) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirmDiscard } = useModal();

  const complaints = data?.complaints ?? [];
  const recOf = (id: string | null) => complaints.find((c) => c.id === id) ?? null;

  /**
   * Typed-but-not-added notes and open note edits are not part of `dirty` — notes save
   * on their own — so they are checked separately.
   */
  const confirmDiscardComplaint = async () => {
    const s = getComplaint();
    const unsavedEdit = !!s.noteEdit && s.noteEdit.value.trim() !== s.noteEdit.orig.trim();
    if (!s.dirty && !s.noteInput.trim() && !unsavedEdit) return true;
    return confirmDiscard(
      s.dirty
        ? 'You have unsaved changes to this complaint. Discard them?'
        : unsavedEdit
          ? "You're part way through editing a note. Discard your changes?"
          : "You've typed a note but haven't added it. Discard it?",
    );
  };

  const openRecord = (rec: ComplaintRow) =>
    setComplaint({
      sel: rec.id,
      draft: false,
      dirty: false,
      error: '',
      noteInput: '',
      noteEdit: null,
      form: formFromComplaint(rec, null),
      formFor: rec.id,
    });

  const selectComplaint = async (id: string) => {
    const rec = recOf(id);
    if (!rec) return;
    if (!(await confirmDiscardComplaint())) return;
    openRecord(rec);
  };

  const newDraft = async (clientId?: string) => {
    if (!(await confirmDiscardComplaint())) return;
    setComplaint({
      sel: null,
      draft: true,
      dirty: false,
      error: '',
      noteInput: '',
      noteEdit: null,
      form: formFromComplaint(null, clientId ?? null),
      formFor: '',
    });
  };

  const cancelDraft = () =>
    setComplaint({
      draft: false,
      dirty: false,
      error: '',
      noteInput: '',
      form: null,
      formFor: null,
    });

  const setField = <K extends keyof ComplaintForm>(field: K, value: ComplaintForm[K]) => {
    const s = getComplaint();
    if (!s.form) return;
    setComplaint({ form: { ...s.form, [field]: value }, dirty: true });
  };

  /** Closing stamps today's date if none is set; reopening clears it. */
  const setStatus = (status: string) => {
    const s = getComplaint();
    if (!s.form) return;
    setComplaint({
      form: {
        ...s.form,
        status,
        closed_date: status === 'Closed' ? s.form.closed_date || today() : '',
      },
      dirty: true,
    });
  };

  const openClient = async (clientId: string) => {
    if (!(await confirmDiscardComplaint())) return;
    navigate(`/client/${clientId}`);
  };

  const deleteComplaint = async (id: string) => {
    if (!confirm('Delete this complaint and all its notes?')) return;
    try {
      // RLS silently drops a delete it refuses, so ask for the row back to tell the two apart
      const { data: rows, error } = await sb.from('complaints').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!rows?.length) throw new Error('only admins can delete complaints');
      await logAudit('deleted', 'complaints', id, {}, {});
      setComplaint({ sel: null, draft: false, dirty: false, form: null, formFor: null });
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
      toast('Complaint deleted');
    } catch (e) {
      toast(`Delete failed: ${(e as Error).message}`, 'error');
    }
  };

  const saveComplaint = async () => {
    const s = getComplaint();
    if (s.saving || s.noteSaving || !s.form) return;
    const f = s.form;
    const rec = s.draft ? null : recOf(s.sel);
    if (!rec && !s.draft) return;

    // Whatever is in the notes box goes in with the save
    const typedNote = s.noteInput.trim();
    // Only a note typed: just add it, without an empty "updated" entry in the audit log
    if (rec && !s.dirty) {
      if (!typedNote) return;
      const ok = await insertComplaintNote(rec.id, typedNote, user?.id);
      if (ok) {
        setComplaint({ noteInput: '' });
        void queryClient.invalidateQueries({ queryKey: ['complaintNotes', rec.id] });
        void queryClient.invalidateQueries({ queryKey: ['complaints'] });
        toast('Note added');
      } else {
        toast("The note couldn't be saved. Press Add note to retry", 'warn');
      }
      return;
    }

    const clientId = s.draft ? f.client_id : rec!.client_id;
    const payload: Partial<Complaint> = {
      tio_ref: f.tio_ref.trim() || null,
      complainant: f.complainant.trim() || null,
      open_date: f.open_date || null,
      closed_date: f.closed_date || null,
      status: f.status,
      assigned_to: f.assigned_to || null,
      description: f.description.trim() || null,
    };

    const fail = (m: string) => setComplaint({ error: m });
    setComplaint({ error: '' });
    if (s.draft && !clientId) return fail('Please select a client.');
    if (!payload.open_date) return fail('Open date is required.');
    if (payload.closed_date && payload.closed_date < payload.open_date)
      return fail("Closed date can't be before the open date.");

    setComplaint({ saving: true });
    let noteFailed = false;
    try {
      let saved: ComplaintRow;
      if (rec) {
        // Capture the pre-edit values so the audit log can show a real field-level diff
        const oldData: Record<string, unknown> = {};
        (Object.keys(payload) as (keyof Complaint)[]).forEach((k) => {
          oldData[k] = rec[k];
        });
        const { error } = await sb.from('complaints').update(payload).eq('id', rec.id);
        if (error) throw error;
        await logAudit('updated', 'complaints', rec.id, oldData, payload);
        saved = { ...rec, ...payload };
        const noteOk = typedNote ? await insertComplaintNote(rec.id, typedNote, user?.id) : true;
        noteFailed = !noteOk;
        if (!noteOk)
          toast(
            "Complaint updated, but the note couldn't be saved. It's still in the notes box: press Add note to retry",
            'warn',
          );
        else toast(typedNote ? 'Complaint updated · note added' : 'Complaint updated');
      } else {
        const { data: row, error } = await sb
          .from('complaints')
          .insert({ ...payload, client_id: clientId, created_by: user?.id })
          .select(COMPLAINT_SELECT)
          .single();
        if (error) throw error;
        saved = row as unknown as ComplaintRow;
        await logAudit('created', 'complaints', saved.id, {}, { ...payload, client_id: clientId });
        const noteOk = typedNote ? await insertComplaintNote(saved.id, typedNote, user?.id) : true;
        noteFailed = !noteOk;
        if (!noteOk)
          toast(
            "Complaint logged, but the note couldn't be saved. It's back in the notes box: press Add note to retry",
            'warn',
          );
        else toast(typedNote ? 'Complaint logged · note added' : 'Complaint logged');
      }

      setComplaint({
        sel: saved.id,
        draft: false,
        dirty: false,
        error: '',
        // A note that went in leaves the box; one that failed stays, on the notes tab
        noteInput: noteFailed ? typedNote : '',
        noteEdit: null,
        form: formFromComplaint(saved, null),
        formFor: saved.id,
        ...(noteFailed ? { tab: 'notes' as const } : {}),
      });
      void queryClient.invalidateQueries({ queryKey: ['complaints'] });
      void queryClient.invalidateQueries({ queryKey: ['complaintNotes', saved.id] });
      void queryClient.invalidateQueries({ queryKey: ['client', saved.client_id] });
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`, 'error');
    } finally {
      setComplaint({ saving: false });
    }
    return undefined;
  };

  return {
    confirmDiscardComplaint,
    openRecord,
    selectComplaint,
    newDraft,
    cancelDraft,
    setField,
    setStatus,
    openClient,
    deleteComplaint,
    saveComplaint,
  };
}
