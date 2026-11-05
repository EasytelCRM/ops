import type { ReactNode } from 'react';

/**
 * The list-and-detail layout behind New Installs, Service Tickets, Porting and Complaints.
 *
 * `pageId` is load-bearing, not decoration: the stylesheet makes only these four pages
 * fill their container, and it does it with id selectors —
 * `#page-porting.active, #page-installs.active, #page-service.active, #page-complaints.active`.
 * Without the right id the split collapses to a plain block.
 */
export function SplitView({
  pageId,
  search,
  filters,
  heading,
  headingAction,
  list,
  detail,
}: {
  pageId: 'page-installs' | 'page-service' | 'page-porting' | 'page-complaints';
  search: { value: string; onChange: (v: string) => void; placeholder: string };
  filters: ReactNode;
  heading: ReactNode;
  headingAction?: ReactNode;
  list: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="page active" id={pageId}>
      <div className="port-split">
        <div className="port-col">
          <div className="search-bar">
            <i className="ti ti-search" />
            <input
              type="text"
              placeholder={search.placeholder}
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
            />
          </div>
          <div className="filter-bar">{filters}</div>
          <div className="card port-list-card">
            <div className="card-head">
              <h3>{heading}</h3>
              {headingAction}
            </div>
            <div className="port-list">{list}</div>
          </div>
        </div>
        <div className="port-col">
          <div className="card">
            <div className="port-detail">{detail}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One row in the list. A button, as it was — it carries the focus ring and hover states. */
export function PortRow({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className={`port-row${selected ? ' sel' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * The footer of a detail pane: what state the record is in, and the way to save it.
 * Goes amber as soon as there are unsaved edits.
 */
export function SaveBar({
  dirty,
  draft,
  saving,
  saveLabel,
  onSave,
  onCancel,
}: {
  dirty: boolean;
  draft: boolean;
  saving: boolean;
  saveLabel: string;
  onSave: () => void;
  onCancel?: () => void;
}) {
  const canSave = (dirty || draft) && !saving;
  return (
    <div className={`port-savebar${dirty ? ' dirty' : ''}`}>
      <span className="port-savemsg">
        {dirty ? 'Unsaved changes' : draft ? 'Not saved yet' : 'All changes saved'}
      </span>
      <div style={{ display: 'flex', gap: 8 }}>
        {onCancel && (
          <button className="btn btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="btn btn-primary btn-sm"
          disabled={!canSave}
          style={{ opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'default' }}
          onClick={onSave}
        >
          <i className="ti ti-check" /> {saveLabel}
        </button>
      </div>
    </div>
  );
}

/** The save bar a technician sees on a record they cannot edit. */
export function ReadOnlyBar({ message }: { message: string }) {
  return (
    <div className="port-savebar">
      <span className="port-savemsg">{message}</span>
    </div>
  );
}
