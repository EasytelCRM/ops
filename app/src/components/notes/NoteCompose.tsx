import { useRef, type ReactNode } from 'react';
import { setNoteBoxBig, useNoteBoxBig } from '../../lib/noteBox';

/** Expand/shrink, shared by every compose box on the page and remembered per browser. */
export function NoteSizeButton() {
  const big = useNoteBoxBig();
  const tip = big ? 'Shrink the note box' : 'Expand the note box';

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    setNoteBoxBig(!big);
    // Drop any height dragged with the corner handle, on every box, so one on a page
    // that is not showing does not go stale
    document
      .querySelectorAll<HTMLTextAreaElement>('.jn-compose textarea')
      .forEach((ta) => (ta.style.height = ''));
    e.currentTarget.closest('.jn-compose')?.querySelector('textarea')?.focus();
  };

  return (
    <button className="btn btn-sm jn-size" title={tip} onClick={toggle}>
      <i className={`ti ti-arrows-${big ? 'minimize' : 'maximize'}`} />
    </button>
  );
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** Text on the left of the bar, e.g. "Ctrl+Enter to add · Esc to cancel". */
  hint: ReactNode;
  /** Ctrl/Cmd+Enter. */
  onSubmit?: () => void;
  /** Escape. */
  onCancel?: () => void;
  /** Client notes open with a heading field; job and complaint notes do not. */
  withTitle?: boolean;
  title?: string;
  onTitleChange?: (v: string) => void;
  titlePlaceholder?: string;
  showSizeButton?: boolean;
  /** Buttons after the size button, e.g. Cancel / Add note. */
  actions?: ReactNode;
  rows?: number;
  hidden?: boolean;
}

/**
 * The add-note box. Place it inside the surface's own wrapper — the stylesheet sizes
 * it from `.port-notes-group` and `#client-tab-notes`, so those have to stay.
 */
export function NoteCompose({
  value,
  onChange,
  placeholder,
  hint,
  onSubmit,
  onCancel,
  withTitle = false,
  title = '',
  onTitleChange,
  titlePlaceholder,
  showSizeButton = true,
  actions,
  rows = 2,
  hidden = false,
}: Props) {
  const big = useNoteBoxBig();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const bodyKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit?.();
    } else if (e.key === 'Escape') {
      onCancel?.();
    }
  };

  return (
    <div
      className={`jn-compose${big ? ' big' : ''}`}
      style={hidden ? { display: 'none' } : undefined}
    >
      {withTitle && (
        <input
          className="cln-title-in"
          maxLength={120}
          autoComplete="off"
          placeholder={titlePlaceholder}
          value={title}
          onChange={(e) => onTitleChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              onSubmit?.();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              bodyRef.current?.focus();
            } else if (e.key === 'Escape') {
              onCancel?.();
            }
          }}
        />
      )}
      <textarea
        ref={bodyRef}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={bodyKeys}
      />
      <div className="jn-compose-bar">
        <span className="jn-hint">{hint}</span>
        {(showSizeButton || actions) && (
          <div style={{ display: 'flex', gap: 6 }}>
            {showSizeButton && <NoteSizeButton />}
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
