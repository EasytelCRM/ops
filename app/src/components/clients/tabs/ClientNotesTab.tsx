import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sb } from '../../../lib/supabase';
import { logAudit } from '../../../lib/audit';
import { CLN_VISIBLE, type NoteEdit, type NoteRow } from '../../../lib/notes';
import { isAdmin, isOps } from '../../../lib/roles';
import { useAuth } from '../../../state/AuthProvider';
import { useToast } from '../../../state/ToastProvider';
import { NotesList } from '../../notes/NotesList';
import { NoteCompose } from '../../notes/NoteCompose';
import { useClientNotes, useProfiles } from '../../../hooks/useClients';

/**
 * The client profile's Notes tab. The add box stays hidden until "Add note" is clicked,
 * so the notes themselves get the room. Client notes are the only ones with a heading.
 */
export function ClientNotesTab({ clientId }: { clientId: string }) {
  const { profile, user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: notes = [], isLoading } = useClientNotes(clientId);
  const { data: profiles = [] } = useProfiles();

  const [composing, setComposing] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [edit, setEdit] = useState<NoteEdit | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['clientNotes', clientId] });
    void queryClient.invalidateQueries({ queryKey: ['client', clientId] });
  };

  const closeCompose = () => {
    setComposing(false);
    setTitle('');
    setText('');
  };

  const cancelCompose = () => {
    if (saving) return;
    if ((text.trim() || title.trim()) && !confirm('Discard this note?')) return;
    closeCompose();
  };

  const addNote = async () => {
    if (saving) return;
    if (!title.trim()) return toast('Give the note a heading', 'warn');
    if (!text.trim()) return toast('Type a note first', 'warn');
    setSaving(true);
    try {
      const { data, error } = await sb
        .from('client_notes')
        .insert({ client_id: clientId, title: title.trim(), text: text.trim(), created_by: user!.id })
        .select('*,profiles(full_name)')
        .single();
      if (error) throw error;
      await logAudit('created', 'client_notes', data.id, {}, {
        client_id: clientId,
        title: title.trim(),
        text: text.trim(),
      });
      closeCompose();
      refresh();
      toast('Note added');
    } catch (e) {
      toast(`Note not saved: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const saveEdit = async () => {
    if (saving || !edit) return;
    const nextText = edit.value.trim();
    const nextTitle = (edit.title ?? '').trim();
    if (nextText === edit.orig.trim() && nextTitle === (edit.origTitle ?? '').trim()) {
      setEdit(null);
      return;
    }
    // Notes from before headings existed may stay without one; a heading once set cannot be blanked
    if (!nextTitle && (edit.origTitle ?? '').trim()) return toast('A note needs a heading.', 'warn');
    if (!nextText)
      return toast(
        isAdmin(profile) ? "A note can't be empty. Delete it instead." : "A note can't be empty.",
        'warn',
      );
    setSaving(true);
    try {
      // RLS silently skips a refused update, so ask for the row back to tell the two apart
      const { data, error } = await sb
        .from('client_notes')
        .update({ text: nextText, title: nextTitle || null })
        .eq('id', edit.id)
        .select('id,text,title,updated_at,updated_by');
      if (error) throw error;
      if (!data?.length) throw new Error('you can only edit your own notes');
      await logAudit(
        'updated',
        'client_notes',
        edit.id,
        { client_id: clientId, title: edit.origTitle || null, text: edit.orig },
        { client_id: clientId, title: nextTitle || null, text: nextText },
      );
      setEdit(null);
      refresh();
      toast('Note updated');
    } catch (e) {
      toast(`Edit not saved: ${(e as Error).message}`, 'error');
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  const deleteNote = async (id: string) => {
    if (!confirm("Delete this note? This can't be undone.")) return;
    const note = notes.find((n) => n.id === id);
    try {
      // RLS silently drops a delete it refuses, so ask for the row back to tell the two apart
      const { data, error } = await sb.from('client_notes').delete().eq('id', id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('only admins can delete notes');
      await logAudit(
        'deleted',
        'client_notes',
        id,
        { client_id: clientId, title: note?.title ?? null, text: note?.text },
        {},
      );
      refresh();
      toast('Note deleted');
    } catch (e) {
      toast(`Delete failed: ${(e as Error).message}`, 'error');
    }
  };

  const canEdit = (n: NoteRow) => isAdmin(profile) || (isOps(profile) && n.created_by === user?.id);

  return (
    <div id="client-tab-notes" className="port-notes-group">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        {!composing && (
          <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)}>
            <i className="ti ti-plus" /> Add note
          </button>
        )}
      </div>
      <div className="jn-wrap">
        {composing && (
          <NoteCompose
            withTitle
            title={title}
            onTitleChange={setTitle}
            titlePlaceholder="Heading, e.g. NBN outage: credit requested"
            value={text}
            onChange={setText}
            placeholder="Add a note: call outcome, account change, anything to follow up…"
            hint="Ctrl+Enter to add · Esc to cancel"
            onSubmit={() => void addNote()}
            onCancel={cancelCompose}
            actions={
              <>
                <button className="btn btn-sm" onClick={cancelCompose}>
                  Cancel
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={saving}
                  style={{ opacity: saving ? 0.5 : 1 }}
                  onClick={() => void addNote()}
                >
                  <i className="ti ti-plus" /> Add note
                </button>
              </>
            }
          />
        )}
        <div className="jn-list">
          {isLoading ? (
            <div className="jn-empty">Loading notes…</div>
          ) : (
            <NotesList
              key={clientId}
              notes={notes}
              profiles={profiles}
              visible={CLN_VISIBLE}
              withTitles
              emptyText="No notes yet. Click Add note to write the first one."
              canEdit={canEdit}
              canDelete={() => isAdmin(profile)}
              edit={edit}
              onEditChange={setEdit}
              onSaveEdit={() => void saveEdit()}
              onDelete={(id) => void deleteNote(id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
