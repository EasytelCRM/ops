import { useEffect, useRef } from 'react';
import type { NoteEdit } from '../../lib/notes';

/**
 * In-place editor for one note. Ctrl/Cmd+Enter saves, Escape cancels; on the client
 * profile, Enter in the heading jumps to the body rather than submitting.
 */
export function NoteEditor({
  edit,
  withTitle = false,
  onChange,
  onSave,
  onCancel,
}: {
  edit: NoteEdit;
  withTitle?: boolean;
  onChange: (next: NoteEdit) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Open with the caret at the end, as the old startNoteEdit did
  useEffect(() => {
    const ta = bodyRef.current;
    if (!ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, [edit.id]);

  const bodyKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="jn-editor">
      {withTitle && (
        <input
          className="fi cln-edit-title"
          maxLength={120}
          autoComplete="off"
          placeholder="Heading"
          value={edit.title ?? ''}
          onChange={(e) => onChange({ ...edit, title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSave();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              bodyRef.current?.focus();
            } else if (e.key === 'Escape') {
              onCancel();
            }
          }}
        />
      )}
      <textarea
        ref={bodyRef}
        className="fi"
        value={edit.value}
        onChange={(e) => onChange({ ...edit, value: e.target.value })}
        onKeyDown={bodyKeys}
      />
      <div className="jn-editor-bar">
        <span className="jn-hint">Ctrl+Enter to save · Esc to cancel</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-sm btn-primary" onClick={onSave}>
            <i className="ti ti-check" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
