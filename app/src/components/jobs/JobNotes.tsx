import { useQueryClient } from '@tanstack/react-query';
import { sb } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import { JN_VISIBLE, type NoteRow } from '../../lib/notes';
import { isAdmin, isOps } from '../../lib/roles';
import { getPane, getStore, setPane, setStore } from '../../lib/jobPanes';
import { useAuth } from '../../state/AuthProvider';
import { useToast } from '../../state/ToastProvider';
import { NoteCompose } from '../notes/NoteCompose';
import { NotesList } from '../notes/NotesList';
import type { JobNoteRow } from '../../hooks/useJobs';
import type { JobKind, JobRow } from '../../lib/jobs';
import type { Profile } from '../../lib/db.types';

/**
 * The note typed in the box when a job is saved. Never throws: the job is already
 * saved, and a "Save failed" here would invite a retry that duplicates it. On failure
 * the caller puts the text back in the notes box.
 */
export async function insertJobNote(jobId: string, text: string, userId: string | undefined) {
  try {
    const { data, error } = await sb
      .from('job_notes')
      .insert({ job_id: jobId, text, created_by: userId })
      .select('*,profiles(full_name)')
      .single();
    if (error) throw error;
    await logAudit('created', 'job_notes', data.id, {}, { job_id: jobId, text });
    return true;
  } catch (e) {
    console.warn('Job note on save failed:', e);
    return false;
  }
}

/**
 * A job's note log: the add box, the entries, and the old `jobs.job_notes` text box
 * pinned underneath as read-only history so nothing written before the log existed
 * goes missing.
 */
export function JobNotes({
  kind,
  rec,
  notes,
  loading,
  profiles,
  readOnly,
}: {
  kind: JobKind;
  rec: JobRow;
  notes: JobNoteRow[];
  loading: boolean;
  profiles: Profile[];
  readOnly: boolean;
}) {
  const { profile, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const pane = getPane(kind);

  const refreshNotes = () => {
    void queryClient.invalidateQueries({ queryKey: ['jobNotes', rec.id] });
    // The No Notes pill counts jobs whose log is empty, so the list has to hear about it
    void queryClient.invalidateQueries({ queryKey: ['jobs'] });
  };

  const addNote = async () => {
    const store = getStore();
    if (store.noteSaving || store.saving) return; // a save in flight may already be adding this note
    const text = pane.noteInput.trim();
    if (!text) return toast('Type a note first', 'warn');
    setStore({ noteSaving: true });
    try {
      const { data, error } = await sb
        .from('job_notes')
        .insert({ job_id: rec.id, text, created_by: user!.id })
        .select('*,profiles(full_name)')
        .single();
      if (error) throw error;
      await logAudit('created', 'job_notes', data.id, {}, { job_id: rec.id, text });
      setPane(kind, { noteInput: '' });
      refreshNotes();
      toast('Note added');
    } catch (e) {
      toast(`Note not saved: ${(e as Error).message}`, 'error');
    } finally {
      setStore({ noteSaving: false });
    }
    return undefined;
  };

  const saveEdit = async () => {
    const ed = getPane(kind).noteEdit;
    if (!ed || getStore().noteSaving) return;
    const text = ed.value.trim();
    if (text === ed.orig.trim()) {
      setPane(kind, { noteEdit: null });
      return;
    }
    if (!text && ed.id !== 'legacy')
      return toast(
        isAdmin(profile) ? "A note can't be empty. Delete it instead." : "A note can't be empty.",
        'warn',
      );
    setStore({ noteSaving: true });
    try {
      if (ed.id === 'legacy') {
        const { error } = await sb
          .from('jobs')
          .update({ job_notes: text || null })
          .eq('id', rec.id);
        if (error) throw error;
        await logAudit(
          'updated',
          'jobs',
          rec.id,
          { job_notes: rec.job_notes },
          { job_notes: text || null },
        );
      } else {
        // RLS silently skips a refused update, so ask for the row back to tell the two apart
        const { data, error } = await sb
          .from('job_notes')
          .update({ text })
          .eq('id', ed.id)
          .select('id,text,updated_at,updated_by');
        if (error) throw error;
        if (!data?.length) throw new Error('you can only edit your own notes');
        await logAudit(
          'updated',
          'job_notes',
          ed.id,
          { job_id: rec.id, text: ed.orig },
          { job_id: rec.id, text },
        );
      }
      setPane(kind, { noteEdit: null });
      refreshNotes();
      toast('Note updated');
    } catch (e) {
      toast(`Edit not saved: ${(e as Error).message}`, 'error');
    } finally {
      setStore({ noteSaving: false });
    }
    return undefined;
  };

  const deleteNote = async (id: string) => {
    if (!confirm("Delete this note? This can't be undone.")) return;
    const note = notes.find((n) => n.id === id);
    try {
      // RLS silently drops a delete it refuses, so ask for the row back to tell the two apart
      const { data, error } = await sb.from('job_notes').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('only admins can delete notes');
      await logAudit('deleted', 'job_notes', id, { job_id: rec.id, text: note?.text }, {});
      refreshNotes();
      toast('Note deleted');
    } catch (e) {
      toast(`Delete failed: ${(e as Error).message}`, 'error');
    }
  };

  const canEditNote = (n: NoteRow) =>
    isAdmin(profile) || (isOps(profile) && n.created_by === user?.id);

  return (
    <>
      <NoteCompose
        value={pane.noteInput}
        onChange={(v) => setPane(kind, { noteInput: v })}
        placeholder="Add a note: progress update, follow-up, call outcome…"
        hint={
          readOnly
            ? 'Ctrl+Enter to add · saves straight away'
            : 'Ctrl+Enter to add · or it goes in with Save changes'
        }
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
            key={rec.id}
            notes={notes}
            profiles={profiles}
            visible={JN_VISIBLE}
            emptyText="No notes yet. Add the first update above."
            legacy={{ text: (rec.job_notes || '').trim(), canEdit: isAdmin(profile) }}
            canEdit={canEditNote}
            canDelete={() => isAdmin(profile)}
            edit={pane.noteEdit}
            onEditChange={(e) => setPane(kind, { noteEdit: e })}
            onSaveEdit={() => void saveEdit()}
            onDelete={(id) => void deleteNote(id)}
          />
        )}
      </div>
    </>
  );
}
