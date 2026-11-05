import { useState } from 'react';
import type { Profile } from '../../lib/db.types';
import { fmtNoteWhen, type NoteEdit, type NoteRow } from '../../lib/notes';
import { initials } from '../../lib/format';
import { NoteText } from './NoteText';
import { NoteEditor } from './NoteEditor';

/** A record's own old notes column, pinned under the log as "Earlier notes". */
export interface LegacyNote {
  text: string;
  canEdit: boolean;
}

interface Props {
  notes: NoteRow[];
  /** Resolves the name behind updated_by on the "(edited)" tooltip. */
  profiles: Profile[];
  /** Newest entries shown before "Show older notes" — 3 on jobs, 10 on the client profile. */
  visible: number;
  /** Client notes carry a heading; job and complaint notes do not. */
  withTitles?: boolean;
  emptyText: string;
  legacy?: LegacyNote | null;
  canEdit: (n: NoteRow) => boolean;
  canDelete: (n: NoteRow) => boolean;
  edit: NoteEdit | null;
  onEditChange: (e: NoteEdit | null) => void;
  onSaveEdit: () => void;
  onDelete: (id: string) => void;
}

/**
 * The note log, shared by the client profile, both job panes and complaints.
 *
 * The surrounding element decides the sizing: the stylesheet keys off
 * `#client-tab-notes` and `.port-notes-group`, so the caller has to keep those.
 * Expanded state is local, so give this a `key` of the record id to reset it when
 * the pane switches records.
 */
export function NotesList({
  notes,
  profiles,
  visible,
  withTitles = false,
  emptyText,
  legacy,
  canEdit,
  canDelete,
  edit,
  onEditChange,
  onSaveEdit,
  onDelete,
}: Props) {
  const [showOlder, setShowOlder] = useState(false);

  const startEdit = (id: string, text: string, title?: string) =>
    onEditChange({ id, orig: text, value: text, origTitle: title ?? '', title: title ?? '' });

  const editorFor = (id: string) =>
    edit?.id === id ? (
      <NoteEditor
        edit={edit}
        withTitle={withTitles}
        onChange={onEditChange}
        onSave={onSaveEdit}
        onCancel={() => onEditChange(null)}
      />
    ) : null;

  const EditBtn = ({ onClick }: { onClick: () => void }) =>
    edit ? null : (
      <button className="jn-act" title="Edit note" onClick={onClick}>
        <i className="ti ti-pencil" />
      </button>
    );

  const entries = notes.map((n) => {
    const editor = n.updated_at
      ? (profiles.find((p) => p.id === n.updated_by)?.full_name ?? 'someone')
      : '';
    return (
      <div className="jn-entry" key={n.id}>
        <div className="jn-av">{initials(n.profiles?.full_name)}</div>
        <div className="jn-body">
          {withTitles && n.title && edit?.id !== n.id && <div className="jn-title">{n.title}</div>}
          <div className="jn-meta">
            <span className="jn-author">{n.profiles?.full_name || 'Unknown'}</span>
            <span className="jn-when">{fmtNoteWhen(n.created_at)}</span>
            {n.updated_at && (
              <span className="jn-edited" title={`Edited by ${editor}, ${fmtNoteWhen(n.updated_at)}`}>
                (edited)
              </span>
            )}
            <span className="jn-acts">
              {canEdit(n) && <EditBtn onClick={() => startEdit(n.id, n.text ?? '', n.title ?? '')} />}
              {canDelete(n) && !edit && (
                <button className="jn-act jn-act-del" title="Delete note" onClick={() => onDelete(n.id)}>
                  <i className="ti ti-trash" />
                </button>
              )}
            </span>
          </div>
          {editorFor(n.id) ?? <NoteText text={n.text ?? ''} />}
        </div>
      </div>
    );
  });

  if (legacy && (legacy.text || edit?.id === 'legacy')) {
    entries.push(
      <div className="jn-entry jn-legacy" key="legacy">
        <div className="jn-av">
          <i className="ti ti-history" />
        </div>
        <div className="jn-body">
          <div className="jn-meta">
            <span className="jn-author" style={{ color: 'var(--text2)' }}>
              Earlier notes
            </span>
            <span className="jn-when">from the old notes box</span>
            <span className="jn-acts">
              {legacy.canEdit && <EditBtn onClick={() => startEdit('legacy', legacy.text)} />}
            </span>
          </div>
          {editorFor('legacy') ?? <NoteText text={legacy.text} />}
        </div>
      </div>,
    );
  }

  const older = entries.length - visible;
  // Keep the note being edited on screen even if it is one of the older ones
  const editIdx = !edit ? -1 : edit.id === 'legacy' ? entries.length - 1 : notes.findIndex((n) => n.id === edit.id);
  const showAll = showOlder || older <= 0 || editIdx >= visible;

  if (!entries.length) return <div className="jn-empty">{emptyText}</div>;

  return (
    <>
      {showAll ? entries : entries.slice(0, visible)}
      {older > 0 && (
        <div className="jn-older">
          <button className="btn btn-sm" onClick={() => setShowOlder((v) => !v)}>
            <i className={`ti ti-chevron-${showAll ? 'up' : 'down'}`} />{' '}
            {showAll ? 'Hide older notes' : `Show ${older} older note${older === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </>
  );
}
