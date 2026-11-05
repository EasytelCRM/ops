import type { ReactNode } from 'react';
import { LegacyBadge, StatusBadge } from '../Badges';
import { TicketHeading } from '../Links';
import { StaffOptions } from '../StaffOptions';
import { SaveBar, ReadOnlyBar } from '../split/SplitView';
import { JobNotes } from './JobNotes';
import { NoteCompose } from '../notes/NoteCompose';
import { setPane } from '../../lib/jobPanes';
import type { JobForm, JobPane } from '../../lib/jobPanes';
import { canEditJob, JOB_KINDS, JOB_SVCS, jobSubtitle, type JobKind, type JobRow } from '../../lib/jobs';
import { isAdmin, isAdminOrOps } from '../../lib/roles';
import { useAuth } from '../../state/AuthProvider';
import { useJobNotes, type JobsData } from '../../hooks/useJobs';
import type { Profile } from '../../lib/db.types';

interface Props {
  kind: JobKind;
  pane: JobPane;
  rec: JobRow | null;
  data: JobsData | undefined;
  profiles: Profile[];
  saving: boolean;
  setField: <K extends keyof JobForm>(field: K, value: JobForm[K]) => void;
  onSave: () => void;
  onCancelDraft: () => void;
  onDelete: (id: string) => void;
  onOpenClient: (clientId: string) => void;
}

/** The right-hand pane: one job, as a form, with its note log under it. */
export function JobDetail({
  kind,
  pane,
  rec,
  data,
  profiles,
  saving,
  setField,
  onSave,
  onCancelDraft,
  onDelete,
  onOpenClient,
}: Props) {
  const { profile, user } = useAuth();
  const draft = pane.draft;
  const f = pane.form;
  // Notes are per job, so a draft has none to fetch yet
  const { data: notes = [], isLoading: notesLoading } = useJobNotes(draft ? null : (rec?.id ?? null));

  if ((!rec && !draft) || !f)
    return (
      <div className="empty port-empty" style={{ padding: '3.5rem 1rem' }}>
        <i className={`ti ${JOB_KINDS[kind].icon}`} />
        <p>Select a {JOB_KINDS[kind].noun} to view or edit it.</p>
      </div>
    );

  // Techs can't edit a job once it's logged, only add notes
  const ro = !draft && !canEditJob(profile);
  const isInstall = f.type === 'New Install';
  const clientId = rec?.client_id || f.client_id;
  const sites = (data?.sites ?? []).filter((s) => s.client_id === clientId);
  const techDraft = draft && !isAdminOrOps(profile); // techs are always assigned the jobs they log
  const createdLock = !isAdmin(profile); // only admins can re-date a ticket or change who logged it
  // Only installs can be cancelled: it takes them off the client's services
  const statuses = ['Pending', 'Incomplete', 'Complete', ...(isInstall ? ['Cancelled'] : [])];

  const typedNote = !draft && !!pane.noteInput.trim();
  const noteCount = notesLoading && !notes.length ? '…' : notes.length + ((rec?.job_notes || '').trim() ? 1 : 0);

  const tab = (t: 'desc' | 'notes', label: ReactNode) => (
    <div
      className={`jd-tab${pane.tab === t ? ' active' : ''}`}
      onClick={() => setPane(kind, { tab: t })}
    >
      {label}
    </div>
  );

  return (
    <div className="port-det">
      <div className="port-det-head">
        <div>
          <div className="port-det-tid">
            {draft ? (
              JOB_KINDS[kind].draft
            ) : (
              <>
                <TicketHeading url={rec!.ticket_url} label={rec!.clients?.company || 'Unknown'} />{' '}
                <StatusBadge status={rec!.status} />
                <LegacyBadge legacy={rec!.legacy} />
              </>
            )}
          </div>
          <div className="port-det-co">
            {draft ? (
              'Pick a client and fill in the job, then save.'
            ) : (
              <>
                {jobSubtitle(rec!)} · {rec!.clients?.account_number || '—'} ·{' '}
                <span
                  style={{ color: 'var(--accent)', cursor: 'pointer' }}
                  onClick={() => onOpenClient(rec!.client_id)}
                >
                  Open client
                </span>
              </>
            )}
          </div>
        </div>
        {!draft && isAdmin(profile) && (
          <button className="btn btn-sm btn-danger" onClick={() => onDelete(rec!.id)}>
            <i className="ti ti-trash" /> Delete
          </button>
        )}
      </div>

      <div className="port-grid">
        {draft && (
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="lbl">Client *</label>
            <select
              className="fi"
              value={f.client_id}
              onChange={(e) => {
                // Sites belong to a client, so the site picker starts over
                setField('client_id', e.target.value);
                setField('site_id', '');
              }}
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
          <label className="lbl">Type *</label>
          <select
            className="fi"
            value={f.type}
            disabled={techDraft || ro}
            onChange={(e) => setField('type', e.target.value)}
          >
            <option>New Install</option>
            <option>Service</option>
          </select>
        </div>

        <div className="form-group">
          <label className="lbl">Status *</label>
          <select
            className="fi"
            value={f.status}
            disabled={ro}
            onChange={(e) => setField('status', e.target.value)}
          >
            {statuses.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>

        {!isInstall && (
          <>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="lbl">Title *</label>
              <input
                className="fi"
                value={f.title}
                placeholder="e.g. NBN line installation"
                disabled={ro}
                onChange={(e) => setField('title', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="lbl">Ticket link</label>
              <input
                className="fi"
                autoComplete="off"
                value={f.ticket_url}
                placeholder="Paste the Assist Portal link"
                disabled={ro}
                onChange={(e) => setField('ticket_url', e.target.value)}
              />
            </div>
          </>
        )}

        <div className="form-group">
          <label className="lbl">Site</label>
          <select
            className="fi"
            value={f.site_id}
            disabled={ro}
            onChange={(e) => setField('site_id', e.target.value)}
          >
            <option value="">— none —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="lbl">Assigned to</label>
          <select
            className="fi"
            value={techDraft ? (user?.id ?? '') : f.assigned_to}
            disabled={techDraft || ro}
            onChange={(e) => setField('assigned_to', e.target.value)}
          >
            <StaffOptions profiles={profiles} selectedId={f.assigned_to} />
          </select>
        </div>

        <div className="form-group">
          <label className="lbl">Due date</label>
          <input
            className="fi"
            type="date"
            value={f.due_date}
            disabled={ro}
            onChange={(e) => setField('due_date', e.target.value)}
          />
        </div>

        {!isInstall && (
          <>
            <div className="form-group">
              <label className="lbl">Cost ($)</label>
              <input
                className="fi"
                type="number"
                step="1"
                min="0"
                value={f.cost}
                placeholder="0"
                disabled={ro}
                onChange={(e) => setField('cost', e.target.value)}
              />
            </div>
            {!draft && (
              <>
                <div className="form-group">
                  <label className="lbl">Created</label>
                  <input
                    className="fi"
                    type="datetime-local"
                    value={f.created_at}
                    disabled={createdLock}
                    onChange={(e) => setField('created_at', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="lbl">Created by</label>
                  <select
                    className="fi"
                    value={f.created_by}
                    disabled={createdLock}
                    onChange={(e) => setField('created_by', e.target.value)}
                  >
                    <StaffOptions
                      profiles={profiles}
                      selectedId={f.created_by}
                      emptyLabel="— Unknown —"
                    />
                  </select>
                </div>
              </>
            )}
          </>
        )}

        {isInstall && (
          <>
            <div className="form-group">
              <label className="lbl">Approval date *</label>
              <input
                className="fi"
                type="date"
                value={f.approval_date}
                disabled={ro}
                onChange={(e) => setField('approval_date', e.target.value)}
              />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="lbl">Services sold</label>
              <div className="checkbox-group">
                {JOB_SVCS.map(([col, label]) => (
                  <label className="checkbox-label" key={col}>
                    <input
                      type="checkbox"
                      checked={f[col]}
                      disabled={ro}
                      onChange={(e) => setField(col, e.target.checked)}
                    />{' '}
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="form-group port-notes-group jd-notes" style={{ marginTop: 12 }}>
        <div className="jd-tabs">
          {tab('desc', 'Description')}
          {tab(
            'notes',
            <>
              Job notes{' '}
              {!draft && <span className="tab-count">{noteCount}</span>}
            </>,
          )}
        </div>
        <textarea
          className="fi"
          placeholder="Job details..."
          value={f.description}
          disabled={ro}
          style={{ display: pane.tab === 'desc' ? '' : 'none' }}
          onChange={(e) => setField('description', e.target.value)}
        />
        <div className="jn-wrap" style={{ display: pane.tab === 'notes' ? '' : 'none' }}>
          {draft ? (
            <NoteCompose
              value={pane.noteInput}
              onChange={(v) => setPane(kind, { noteInput: v })}
              placeholder="Add a note: what's been agreed, access details, anything to follow up…"
              hint="Saved as the first note when you log the job"
            />
          ) : (
            <JobNotes
              kind={kind}
              rec={rec!}
              notes={notes}
              loading={notesLoading}
              profiles={profiles}
              readOnly={ro}
            />
          )}
        </div>
      </div>

      {pane.error && <div className="form-error">{pane.error}</div>}

      {ro ? (
        <ReadOnlyBar message="Read only — add a note to update this job." />
      ) : (
        <SaveBar
          dirty={pane.dirty || typedNote}
          draft={draft}
          saving={saving}
          saveLabel={draft ? 'Log job' : 'Save changes'}
          onSave={onSave}
          onCancel={draft ? onCancelDraft : undefined}
        />
      )}
    </div>
  );
}
