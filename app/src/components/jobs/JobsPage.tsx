import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { LegacyBadge, StatusBadge } from '../Badges';
import { PortRow, SplitView } from '../split/SplitView';
import { JobDetail } from './JobDetail';
import { useJobActions } from './useJobActions';
import { useJobsData, type JobNoteRow } from '../../hooks/useJobs';
import { useProfiles } from '../../hooks/useClients';
import {
  JOB_KINDS,
  jobKindOf,
  jobNoNotes,
  jobSubtitle,
  notesSearchText,
  type JobKind,
  type JobRow,
} from '../../lib/jobs';
import { daysOut, fmtDate } from '../../lib/format';
import { formFromJob, setPane, setStore, useJobStore } from '../../lib/jobPanes';
import { isAdminOrOps } from '../../lib/roles';
import { useAuth } from '../../state/AuthProvider';
import { useTopbarCta } from '../../state/TopbarProvider';
import { safeTicketUrl } from '../Links';

const SEARCH_PLACEHOLDER: Record<JobKind, string> = {
  installs: 'Search client, service or notes...',
  service: 'Search client, job title or notes...',
};

/**
 * New Installs and Service Tickets are the same page over a different slice of `jobs`,
 * exactly as they were in the single-file app — same list, same detail pane, and a
 * record that changes Type simply moves to the other one.
 */
export function JobsPage({ kind }: { kind: JobKind }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useJobsData();
  const { data: profiles = [] } = useProfiles();
  const store = useJobStore();
  const pane = store.panes[kind];
  const actions = useJobActions(kind, data, profiles);

  const jobs = data?.jobs ?? [];
  const sel = pane.sel ? (jobs.find((j) => j.id === pane.sel) ?? null) : null;

  // A selection deleted elsewhere goes; a clean pane follows the record it is showing,
  // which is what the single-file app did after every loadJobs.
  useEffect(() => {
    if (!data) return;
    if (pane.sel && !sel) {
      setPane(kind, { sel: null, dirty: false, form: null, formFor: null });
      return;
    }
    if (sel && !pane.dirty && !pane.draft && pane.formFor === sel.id)
      setPane(kind, { form: formFromJob(sel, kind, null, null) });
    // Re-seeding is keyed on the record, not on every render of it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sel?.id, kind]);

  // Arriving from a client profile or the dashboard: ?id= opens that job, ?new= starts
  // a draft for that client. The single-file app set the selection and then switched page.
  const paramId = params.get('id');
  const paramNew = params.get('new');
  useEffect(() => {
    if (!paramId && !paramNew) return;
    if (!data) return; // wait for the record to exist
    setParams({}, { replace: true });
    if (paramId) {
      const rec = jobs.find((j) => j.id === paramId);
      if (rec) void actions.selectJob(rec.id);
    } else if (paramNew) {
      void actions.newDraft(paramNew);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId, paramNew, data]);

  const liveNotesFor = (id: string) => queryClient.getQueryData<JobNoteRow[]>(['jobNotes', id]);
  const noNotes = (j: JobRow) =>
    jobNoNotes(j, liveNotesFor(j.id), data?.noteIndex ?? {}, data?.noteIndexReady ?? false);

  const q = pane.search.toLowerCase();
  let list = jobs.filter((j) => {
    if (jobKindOf(j) !== kind) return false;
    const matchQ =
      !q ||
      (j.clients?.company || '').toLowerCase().includes(q) ||
      jobSubtitle(j).toLowerCase().includes(q) ||
      (j.job_notes || '').toLowerCase().includes(q) ||
      notesSearchText(liveNotesFor(j.id), data?.noteIndex?.[j.id]).includes(q);
    return matchQ && (pane.filter === 'all' || j.status === pane.filter);
  });

  // The pill counts what it would show, so it is useful before it is switched on
  const noNotesCount = kind === 'installs' ? list.filter(noNotes).length : 0;
  if (kind === 'installs' && store.noNotesOnly) list = list.filter(noNotes);

  const statuses = ['Pending', 'Incomplete', 'Complete', ...(kind === 'installs' ? ['Cancelled'] : []), 'all'];
  const canLogJob = kind === 'service' || isAdminOrOps(profile);

  // The same action the list heading carries, mirrored into the topbar as showPage() did.
  // The node is rebuilt every render, so the effect is keyed on the gate alone and the
  // click goes through a ref rather than capturing a stale handler.
  const newDraftRef = useRef(actions.newDraft);
  newDraftRef.current = actions.newDraft;
  useTopbarCta(
    canLogJob ? (
      <button className="btn btn-primary btn-sm" onClick={() => void newDraftRef.current()}>
        <i className="ti ti-plus" /> Log job
      </button>
    ) : null,
    [kind, canLogJob],
  );

  return (
    <SplitView
      pageId={kind === 'installs' ? 'page-installs' : 'page-service'}
      search={{
        value: pane.search,
        onChange: (v) => setPane(kind, { search: v }),
        placeholder: SEARCH_PLACEHOLDER[kind],
      }}
      filters={
        <>
          {statuses.map((s) => (
            <button
              key={s}
              className={`filter-btn${pane.filter === s ? ' active' : ''}`}
              onClick={() => setPane(kind, { filter: s })}
            >
              {s === 'all' ? 'All' : s}
            </button>
          ))}
          {kind === 'installs' && (
            <button
              className={`filter-btn nonotes-btn${store.noNotesOnly ? ' active' : ''}`}
              title="Show only past-due installs with no job notes"
              onClick={() => setStore({ noNotesOnly: !store.noNotesOnly })}
            >
              No Notes ({noNotesCount})
            </button>
          )}
        </>
      }
      heading={`${JOB_KINDS[kind].heading} (${list.length})`}
      headingAction={
        canLogJob && (
          <button className="btn btn-primary btn-sm" onClick={() => void actions.newDraft()}>
            <i className="ti ti-plus" /> Log job
          </button>
        )
      }
      list={
        list.length ? (
          list.map((j) => (
            <PortRow key={j.id} selected={j.id === pane.sel} onClick={() => void actions.selectJob(j.id)}>
              <div className="port-row-top">
                <span className="port-tid">
                  {j.clients?.company || 'Unknown'}
                  {safeTicketUrl(j.ticket_url) && (
                    <>
                      {' '}
                      <i className="ti ti-link" title="Has ticket link" />
                    </>
                  )}
                </span>
                <span>
                  <LegacyBadge legacy={j.legacy} />
                  <StatusBadge status={j.status} />
                </span>
              </div>
              <div className="port-row-mid">
                <div className="port-co">{jobSubtitle(j)}</div>
                {noNotes(j) && (
                  <span className="badge badge-purple">
                    <i className="ti ti-notes-off" /> No Notes
                  </span>
                )}
              </div>
              <div className="port-row-bot">
                <span
                  className={`port-when${j.status === 'Pending' && daysOut(j.due_date) <= 1 ? ' due' : ''}`}
                >
                  {fmtDate(j.due_date)}
                </span>
                <span className="port-who">
                  <i className="ti ti-user" /> {j.profiles?.full_name || 'Unassigned'}
                </span>
              </div>
            </PortRow>
          ))
        ) : (
          <div className="empty">
            <i className={`ti ${JOB_KINDS[kind].icon}`} />
            <p>{isLoading ? 'Loading…' : JOB_KINDS[kind].empty}</p>
          </div>
        )
      }
      detail={
        <JobDetail
          kind={kind}
          pane={pane}
          rec={sel}
          data={data}
          profiles={profiles}
          saving={store.saving}
          setField={actions.setField}
          onSave={() => void actions.saveJob()}
          onCancelDraft={actions.cancelDraft}
          onDelete={(id) => void actions.deleteJob(id)}
          onOpenClient={(id) => void actions.openClient(id)}
        />
      }
    />
  );
}
