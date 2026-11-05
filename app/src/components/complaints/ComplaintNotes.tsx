import { useQueryClient } from '@tanstack/react-query';
import { sb } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import { JN_VISIBLE, type NoteRow } from '../../lib/notes';
import { isAdmin } from '../../lib/roles';
import { getComplaint, setComplaint } from '../../lib/complaintPane';
import { useAuth } from '../../state/AuthProvider';
import { useToast } from '../../state/ToastProvider';
import { NoteCompose } from '../notes/NoteCompose';
import { NotesList } from '../notes/NotesList';
import type { ComplaintNoteRow } from '../../hooks/useComplaints';
import type { Profile } from '../../lib/db.types';

/**
 * The note typed in the box when the complaint is saved. Never throws: the complaint is
 * already saved, and a "Save failed" here would invite a retry that duplicates it.
 */
export async function insertComplaintNote(
  complaintId: string,
  text: string,
  userId: string | undefined,
) {
  try {
    const { data, error } = await sb
      .from('complaint_notes')
      .insert({ complaint_id: complaintId, text, created_by: userId })
      .select('*,profiles(full_name)')
      .single();
    if (error) throw error;
    await logAudit('created', 'complaint_notes', data.id, {}, { complaint_id: complaintId, text });
    return true;
  } catch (e) {
    console.warn('Complaint note on save failed:', e);
    return false;
  }
}

/**
 * A complaint's note log. The same append-only log as job notes, minus the "Earlier
 * notes" entry — complaints never had an old free-text box to carry over. Anyone may
 * edit their own note here, which is looser than the client and job logs.
 */
export function ComplaintNotes({
  complaintId,
  notes,
  loading,
  profiles,
}: {
  complaintId: string;
  notes: ComplaintNoteRow[];
  loading: boolean;
  profiles: Profile[];
}) {
  const { profile, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const pane = getComplaint();

  const refreshNotes = () => {
    void queryClient.invalidateQueries({ queryKey: ['complaintNotes', complaintId] });
    void queryClient.invalidateQueries({ queryKey: ['complaints'] });
  };

  const addNote = async () => {
    const s = getComplaint();
    if (s.noteSaving || s.saving) return; // a save in flight may already be adding this note
    const text = s.noteInput.trim();
    if (!text) return toast('Type a note first', 'warn');
    setComplaint({ noteSaving: true });
    try {
      const { data, error } = await sb
        .from('complaint_notes')
        .insert({ complaint_id: complaintId, text, created_by: user!.id })
        .select('*,profiles(full_name)')
        .single();
      if (error) throw error;
      await logAudit('created', 'complaint_notes', data.id, {}, { complaint_id: complaintId, text });
      setComplaint({ noteInput: '' });
      refreshNotes();
      toast('Note added');
    } catch (e) {
      toast(`Note not saved: ${(e as Error).message}`, 'error');
    } finally {
      setComplaint({ noteSaving: false });
    }
    return undefined;
  };

  const saveEdit = async () => {
    const ed = getComplaint().noteEdit;
    if (!ed || getComplaint().noteSaving) return;
    const text = ed.value.trim();
    if (text === ed.orig.trim()) {
      setComplaint({ noteEdit: null });
      return;
    }
    if (!text)
      return toast(
        isAdmin(profile) ? "A note can't be empty. Delete it instead." : "A note can't be empty.",
        'warn',
      );
    setComplaint({ noteSaving: true });
    try {
      // RLS silently skips a refused update, so ask for the row back to tell the two apart
      const { data, error } = await sb
        .from('complaint_notes')
        .update({ text })
        .eq('id', ed.id)
        .select('id,text,updated_at,updated_by');
      if (error) throw error;
      if (!data?.length) throw new Error('you can only edit your own notes');
      await logAudit(
        'updated',
        'complaint_notes',
        ed.id,
        { complaint_id: complaintId, text: ed.orig },
        { complaint_id: complaintId, text },
      );
      setComplaint({ noteEdit: null });
      refreshNotes();
      toast('Note updated');
    } catch (e) {
      toast(`Edit not saved: ${(e as Error).message}`, 'error');
    } finally {
      setComplaint({ noteSaving: false });
    }
    return undefined;
  };

  const deleteNote = async (id: string) => {
    if (!confirm("Delete this note? This can't be undone.")) return;
    const note = notes.find((n) => n.id === id);
    try {
      // RLS silently drops a delete it refuses, so ask for the row back to tell the two apart
      const { data, error } = await sb.from('complaint_notes').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('only admins can delete notes');
      await logAudit(
        'deleted',
        'complaint_notes',
        id,
        { complaint_id: complaintId, text: note?.text },
        {},
      );
      refreshNotes();
      toast('Note deleted');
    } catch (e) {
      toast(`Delete failed: ${(e as Error).message}`, 'error');
    }
  };

  // Anyone may edit their own complaint note; admins may edit any
  const canEditNote = (n: NoteRow) => isAdmin(profile) || n.created_by === user?.id;

  return (
    <>
      <NoteCompose
        value={pane.noteInput}
        onChange={(v) => setComplaint({ noteInput: v })}
        placeholder="Add a note: call outcome, TIO correspondence, resolution offered…"
        hint="Ctrl+Enter to add · or it goes in with Save changes"
        onSubmit={() => void addNote()}
        actions={
          <button className="btn btn-sm" onClick={() => void addNote()}>
            <i className="ti ti-plus" /> Add note
          </button>
        }
      />
      <div className="jn-list">
        {loading && !notes.length ? (
          <div className="jn-empty">Loading notes…</div>
        ) : (
          <NotesList
            key={complaintId}
            notes={notes}
            profiles={profiles}
            visible={JN_VISIBLE}
            emptyText="No notes yet. Add the first update above."
            canEdit={canEditNote}
            canDelete={() => isAdmin(profile)}
            edit={pane.noteEdit}
            onEditChange={(e) => setComplaint({ noteEdit: e })}
            onSaveEdit={() => void saveEdit()}
            onDelete={(id) => void deleteNote(id)}
          />
        )}
      </div>
    </>
  );
}
