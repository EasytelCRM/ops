import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PortingStatusBadge } from '../components/Badges';
import { safeTicketUrl, TicketHeading } from '../components/Links';
import { PortRow, ReadOnlyBar, SaveBar, SplitView } from '../components/split/SplitView';
import { usePortingActions } from '../components/porting/usePortingActions';
import { usePortingData } from '../hooks/usePorting';
import { PORTING_STATUSES } from '../lib/porting';
import { formFromPorting, setPorting, usePortingPane } from '../lib/portingPane';
import { daysOut, fmtDate } from '../lib/format';
import { isAdminOrOps } from '../lib/roles';
import { useAuth } from '../state/AuthProvider';

export function PortingPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = usePortingData();
  const pane = usePortingPane();
  const actions = usePortingActions(data);

  const ports = data?.ports ?? [];
  const sel = pane.sel ? (ports.find((p) => p.id === pane.sel) ?? null) : null;

  // A ticket deleted elsewhere goes; a clean pane follows the record it is showing
  useEffect(() => {
    if (!data) return;
    if (pane.sel && !sel) {
      setPorting({ sel: null, dirty: false, form: null, formFor: null });
      return;
    }
    if (sel && !pane.dirty && !pane.draft && pane.formFor === sel.id)
      setPorting({ form: formFromPorting(sel, null) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sel?.id]);

  // The client profile hands off with ?id= / ?new=, as openPortingPage did
  const paramId = params.get('id');
  const paramNew = params.get('new');
  useEffect(() => {
    if ((!paramId && !paramNew) || !data) return;
    setParams({}, { replace: true });
    if (paramId) {
      const rec = ports.find((p) => p.id === paramId);
      if (rec) void actions.selectPorting(rec.id);
    } else if (paramNew) {
      void actions.newDraft(paramNew);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId, paramNew, data]);

  const q = pane.search.toLowerCase();
  const list = ports.filter((p) => {
    const matchQ =
      !q ||
      (p.clients?.company || '').toLowerCase().includes(q) ||
      (p.clients?.account_number || '').toLowerCase().includes(q) ||
      (p.phone_numbers || '').toLowerCase().includes(q) ||
      (p.notes || '').toLowerCase().includes(q);
    return matchQ && (pane.filter === 'all' || p.status === pane.filter);
  });

  const canEdit = isAdminOrOps(profile); // porting is read-only for techs
  const f = pane.form;

  return (
    <SplitView
      pageId="page-porting"
      search={{
        value: pane.search,
        onChange: (v) => setPorting({ search: v }),
        placeholder: 'Search client, account no., number or notes...',
      }}
      filters={
        <>
          {['Pending', 'Complete', 'all'].map((s) => (
            <button
              key={s}
              className={`filter-btn${pane.filter === s ? ' active' : ''}`}
              onClick={() => setPorting({ filter: s })}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
        </>
      }
      heading={`Porting tickets (${list.length})`}
      headingAction={
        canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => void actions.newDraft()}>
            <i className="ti ti-plus" /> Log port
          </button>
        )
      }
      list={
        list.length ? (
          list.map((p) => (
            <PortRow key={p.id} selected={p.id === pane.sel} onClick={() => void actions.selectPorting(p.id)}>
              <div className="port-row-top">
                <span className="port-tid">
                  {p.clients?.company || 'Unknown'}
                  {safeTicketUrl(p.ticket_url) && (
                    <>
                      {' '}
                      <i className="ti ti-link" title="Has ticket link" />
                    </>
                  )}
                </span>
                <PortingStatusBadge status={p.status} />
              </div>
              <div className="port-co">{p.phone_numbers}</div>
              <div className="port-row-bot">
                <span
                  className={`port-when${p.status === 'Pending' && daysOut(p.port_date) <= 1 ? ' due' : ''}`}
                >
                  {fmtDate(p.port_date)}
                  {p.port_time ? ` · ${p.port_time.slice(0, 5)}` : ''}
                </span>
                {p.losing_carrier && (
                  <span className="port-carrier">
                    <i className="ti ti-building" /> {p.losing_carrier}
                  </span>
                )}
              </div>
            </PortRow>
          ))
        ) : (
          <div className="empty">
            <i className="ti ti-phone-outgoing" />
            <p>{isLoading ? 'Loading…' : 'No porting tickets found.'}</p>
          </div>
        )
      }
      detail={
        (!sel && !pane.draft) || !f ? (
          <div className="empty port-empty" style={{ padding: '3.5rem 1rem' }}>
            <i className="ti ti-phone-outgoing" />
            <p>Select a ticket to view or edit it.</p>
          </div>
        ) : (
          <div className="port-det">
            <div className="port-det-head">
              <div>
                <div className="port-det-tid">
                  {pane.draft ? (
                    'New porting ticket'
                  ) : (
                    <>
                      <TicketHeading url={sel!.ticket_url} label={sel!.clients?.company || 'Unknown'} />{' '}
                      <PortingStatusBadge status={sel!.status} />
                    </>
                  )}
                </div>
                <div className="port-det-co">
                  {pane.draft ? (
                    'Pick a client and fill in the ticket, then save.'
                  ) : (
                    <>
                      {sel!.phone_numbers} · {sel!.clients?.account_number || '—'} ·{' '}
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
              {!pane.draft && canEdit && (
                <button className="btn btn-sm btn-danger" onClick={() => void actions.deletePorting(sel!.id)}>
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
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="lbl">Ticket link</label>
                <input
                  className="fi"
                  autoComplete="off"
                  value={f.ticket_url}
                  placeholder="Paste the Assist Portal link — the REQ number is filled in for you"
                  disabled={!canEdit}
                  onChange={(e) => actions.setTicketUrl(e.target.value)}
                />
                {pane.urlHint && (
                  <div className="form-error" style={{ marginTop: 4 }}>
                    {pane.urlHint}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="lbl">Ticket number</label>
                <input
                  className="fi"
                  autoComplete="off"
                  value={f.phone_numbers}
                  placeholder="Blank = TBC (Pending only)"
                  disabled={!canEdit}
                  onChange={(e) => actions.setField('phone_numbers', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="lbl">Losing carrier *</label>
                <input
                  className="fi"
                  value={f.losing_carrier}
                  placeholder="e.g. Telstra"
                  disabled={!canEdit}
                  onChange={(e) => actions.setField('losing_carrier', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="lbl">Port date</label>
                <input
                  className="fi"
                  type="date"
                  value={f.port_date}
                  disabled={!canEdit}
                  onChange={(e) => actions.setField('port_date', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="lbl">Port time</label>
                <input
                  className="fi"
                  type="time"
                  value={f.port_time}
                  disabled={!canEdit}
                  onChange={(e) => actions.setField('port_time', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="lbl">Status</label>
                <select
                  className="fi"
                  value={f.status}
                  disabled={!canEdit}
                  onChange={(e) => actions.setField('status', e.target.value)}
                >
                  {PORTING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group port-notes-group" style={{ marginTop: 12 }}>
              <label className="lbl">Notes</label>
              <textarea
                className="fi"
                placeholder="Any notes about this port..."
                value={f.notes}
                disabled={!canEdit}
                onChange={(e) => actions.setField('notes', e.target.value)}
              />
            </div>

            {pane.error && <div className="form-error">{pane.error}</div>}

            {canEdit ? (
              <SaveBar
                dirty={pane.dirty}
                draft={pane.draft}
                saving={pane.saving}
                saveLabel={pane.draft ? 'Log port' : 'Save changes'}
                onSave={() => void actions.savePorting()}
                onCancel={pane.draft ? actions.cancelDraft : undefined}
              />
            ) : (
              <ReadOnlyBar message="Read only — ask ops to update this ticket." />
            )}
          </div>
        )
      }
    />
  );
}
