import { useEffect, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ComplaintStatusBadge } from '../components/Badges';
import { StaffOptions } from '../components/StaffOptions';
import { PortRow, SaveBar, SplitView } from '../components/split/SplitView';
import { ComplaintNotes } from '../components/complaints/ComplaintNotes';
import { NoteCompose } from '../components/notes/NoteCompose';
import { useComplaintActions } from '../components/complaints/useComplaintActions';
import { useComplaintNotes, useComplaintsData } from '../hooks/useComplaints';
import { useProfiles } from '../hooks/useClients';
import {
  COMPLAINT_STATUSES,
  formFromComplaint,
  setComplaint,
  useComplaintPane,
} from '../lib/complaintPane';
import { fmtDate } from '../lib/format';
import { notesSearchText } from '../lib/jobs';
import { useTopbarCta } from '../state/TopbarProvider';

export function ComplaintsPage() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useComplaintsData();
  const { data: profiles = [] } = useProfiles();
  const pane = useComplaintPane();
  const actions = useComplaintActions(data);

  const complaints = data?.complaints ?? [];
  const sel = pane.sel ? (complaints.find((c) => c.id === pane.sel) ?? null) : null;
  const { data: notes = [], isLoading: notesLoading } = useComplaintNotes(
    pane.draft ? null : (sel?.id ?? null),
  );

  // A complaint deleted elsewhere goes; a clean pane follows the record it is showing
  useEffect(() => {
    if (!data) return;
    if (pane.sel && !sel) {
      setComplaint({ sel: null, dirty: false, form: null, formFor: null });
      return;
    }
    if (sel && !pane.dirty && !pane.draft && pane.formFor === sel.id)
      setComplaint({ form: formFromComplaint(sel, null) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sel?.id]);

  // The client profile hands off with ?id= / ?new=, as openComplaintPage did
  const paramId = params.get('id');
  const paramNew = params.get('new');
  useEffect(() => {
    if ((!paramId && !paramNew) || !data) return;
    setParams({}, { replace: true });
    if (paramId) {
      const rec = complaints.find((c) => c.id === paramId);
      if (rec) void actions.selectComplaint(rec.id);
    } else if (paramNew) {
      void actions.newDraft(paramNew);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId, paramNew, data]);

  const q = pane.search.toLowerCase();
  const list = complaints.filter((c) => {
    const matchQ =
      !q ||
      [c.clients?.company, c.clients?.account_number, c.complainant, c.tio_ref].some((v) =>
        (v || '').toLowerCase().includes(q),
      ) ||
      notesSearchText(c.id === sel?.id ? notes : undefined, data?.noteIndex?.[c.id]).includes(q);
    return matchQ && (pane.filter === 'all' || c.status === pane.filter);
  });

  const f = pane.form;
  const typedNote = !pane.draft && !!pane.noteInput.trim();
  const noteCount = notesLoading && !notes.length ? '…' : notes.length;
  const sub = sel
    ? [sel.tio_ref ? `TIO ${sel.tio_ref}` : 'No TIO ref', sel.complainant || null]
        .filter(Boolean)
        .join(' · ')
    : '';

  // Mirrored into the topbar as showPage() did. Unlike porting, the old app gave every
  // role this one, so there is no gate here. The click goes through a ref because the
  // actions hook returns fresh functions on every render.
  const newDraftRef = useRef(actions.newDraft);
  newDraftRef.current = actions.newDraft;
  useTopbarCta(
    <button className="btn btn-primary btn-sm" onClick={() => void newDraftRef.current()}>
      <i className="ti ti-plus" /> Log complaint
    </button>,
    [],
  );

  const tab = (t: 'desc' | 'notes', label: ReactNode) => (
    <div className={`jd-tab${pane.tab === t ? ' active' : ''}`} onClick={() => setComplaint({ tab: t })}>
      {label}
    </div>
  );

  return (
    <SplitView
      pageId="page-complaints"
      search={{
        value: pane.search,
        onChange: (v) => setComplaint({ search: v }),
        placeholder: 'Search client, account no., complainant, TIO ref or notes...',
      }}
      filters={
        <>
          {['Pending', 'Closed', 'all'].map((s) => (
            <button
              key={s}
              className={`filter-btn${pane.filter === s ? ' active' : ''}`}
              onClick={() => setComplaint({ filter: s })}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </>
      }
      heading={`Complaints (${list.length})`}
      headingAction={
        <button className="btn btn-primary btn-sm" onClick={() => void actions.newDraft()}>
          <i className="ti ti-plus" /> Log complaint
        </button>
      }
      list={
        list.length ? (
          list.map((c) => (
            <PortRow
              key={c.id}
              selected={c.id === pane.sel}
              onClick={() => void actions.selectComplaint(c.id)}
            >
              <div className="port-row-top">
                <span className="port-tid">{c.clients?.company || 'Unknown'}</span>
                <ComplaintStatusBadge status={c.status} />
              </div>
              <div className="port-co">{c.complainant || 'No complainant'}</div>
              <div className="port-row-bot">
                <span className="port-when">Opened {fmtDate(c.open_date)}</span>
                <span className="port-carrier">
                  <i className="ti ti-file-text" /> {c.tio_ref || 'No TIO ref'}
                </span>
              </div>
            </PortRow>
          ))
        ) : (
          <div className="empty">
            <i className="ti ti-message-report" />
            <p>{isLoading ? 'Loading…' : 'No complaints found.'}</p>
          </div>
        )
      }
      detail={
        (!sel && !pane.draft) || !f ? (
          <div className="empty port-empty" style={{ padding: '3.5rem 1rem' }}>
            <i className="ti ti-message-report" />
            <p>Select a complaint to view or edit it.</p>
          </div>
        ) : (
          <div className="port-det">
            <div className="port-det-head">
              <div>
                <div className="port-det-tid">
                  {pane.draft ? (
                    'New complaint'
                  ) : (
                    <>
                      {sel!.clients?.company || 'Unknown'} <ComplaintStatusBadge status={sel!.status} />
                    </>
                  )}
                </div>
                <div className="port-det-co">
                  {pane.draft ? (
                    'Pick a client and fill in the complaint, then save.'
                  ) : (
                    <>
                      {sub} · {sel!.clients?.account_number || '—'} ·{' '}
                      <span
                        style={{ color: 'var(--accent)', cursor: 'pointer' }}
                        onClick={() => void actions.openClient(sel!.client_id)}
                      >
                        Open client
                      </span>
                    </>
                  )}
                </div>
              </div>
              {!pane.draft && (
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => void actions.deleteComplaint(sel!.id)}
                >
                  <i className="ti ti-trash" /> Delete
                </button>
              )}
            </div>

            <div className="port-grid">
              {pane.draft && (
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label className="lbl">Client *</label>
                  <select
                    className="fi"
                    value={f.client_id}
                    onChange={(e) => actions.setField('client_id', e.target.value)}
                  >
                    <option value="">— select client —</option>
                    {(data?.clients ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.company}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label className="lbl">TIO reference</label>
                <input
                  className="fi"
                  autoComplete="off"
                  value={f.tio_ref}
                  placeholder="e.g. CRM:2026/10/04412"
                  onChange={(e) => actions.setField('tio_ref', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="lbl">Complainant</label>
                <input
                  className="fi"
                  autoComplete="off"
                  value={f.complainant}
                  placeholder="Customer name"
                  onChange={(e) => actions.setField('complainant', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="lbl">Open date *</label>
                <input
                  className="fi"
                  type="date"
                  value={f.open_date}
                  onChange={(e) => actions.setField('open_date', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="lbl">Closed date</label>
                <input
                  className="fi"
                  type="date"
                  value={f.closed_date}
                  onChange={(e) => actions.setField('closed_date', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="lbl">Status *</label>
                <select
                  className="fi"
                  value={f.status}
                  onChange={(e) => actions.setStatus(e.target.value)}
                >
                  {COMPLAINT_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="lbl">Assigned to</label>
                <select
                  className="fi"
                  value={f.assigned_to}
                  onChange={(e) => actions.setField('assigned_to', e.target.value)}
                >
                  <StaffOptions profiles={profiles} selectedId={f.assigned_to} />
                </select>
              </div>
            </div>

            <div className="form-group port-notes-group jd-notes" style={{ marginTop: 12 }}>
              <div className="jd-tabs">
                {tab('desc', 'Description')}
                {tab(
                  'notes',
                  <>
                    Complaint notes {!pane.draft && <span className="tab-count">{noteCount}</span>}
                  </>,
                )}
              </div>
              <textarea
                className="fi"
                placeholder="What's the complaint about?"
                value={f.description}
                style={{ display: pane.tab === 'desc' ? '' : 'none' }}
                onChange={(e) => actions.setField('description', e.target.value)}
              />
              <div className="jn-wrap" style={{ display: pane.tab === 'notes' ? '' : 'none' }}>
                {pane.draft ? (
                  <NoteCompose
                    value={pane.noteInput}
                    onChange={(v) => setComplaint({ noteInput: v })}
                    placeholder="Add a note: how the complaint came in, what's been agreed, next steps…"
                    hint="Saved as the first note when you log the complaint"
                  />
                ) : (
                  <ComplaintNotes
                    complaintId={sel!.id}
                    notes={notes}
                    loading={notesLoading}
                    profiles={profiles}
                  />
                )}
              </div>
            </div>

            {pane.error && <div className="form-error">{pane.error}</div>}

            <SaveBar
              dirty={pane.dirty || typedNote}
              draft={pane.draft}
              saving={pane.saving}
              saveLabel={pane.draft ? 'Log complaint' : 'Save changes'}
              onSave={() => void actions.saveComplaint()}
              onCancel={pane.draft ? actions.cancelDraft : undefined}
            />
          </div>
        )
      }
    />
  );
}
