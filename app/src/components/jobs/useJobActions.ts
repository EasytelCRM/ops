import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { sb } from '../../lib/supabase';
import { logAudit } from '../../lib/audit';
import { sendAssignmentEmail } from '../../lib/email';
import { safeTicketUrl } from '../Links';
import {
  formFromJob,
  getPane,
  getStore,
  setPane,
  setPanes,
  setStore,
  type JobForm,
  type JobPane,
} from '../../lib/jobPanes';
import { JOB_KINDS, jobKindOf, type JobKind, type JobRow } from '../../lib/jobs';
import { isAdmin, isAdminOrOps } from '../../lib/roles';
import { useAuth } from '../../state/AuthProvider';
import { useModal } from '../../state/ModalProvider';
import { useToast } from '../../state/ToastProvider';
import { insertJobNote } from './JobNotes';
import type { JobsData } from '../../hooks/useJobs';
import type { Job, Profile } from '../../lib/db.types';

/**
 * Everything the two job panes do to the database, plus the selection changes that
 * have to check for unsaved work first.
 */
export function useJobActions(kind: JobKind, data: JobsData | undefined, profiles: Profile[]) {
  const { profile, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirmDiscard } = useModal();

  const jobs = data?.jobs ?? [];
  const recOf = (id: string | null) => jobs.find((j) => j.id === id) ?? null;

  /**
   * Typed-but-not-added notes and open note edits are not part of `dirty` — notes save
   * on their own — so they are checked separately, as the single-file app did.
   */
  const confirmDiscardJob = async () => {
    const p = getPane(kind);
    const unsavedEdit = !!p.noteEdit && p.noteEdit.value.trim() !== p.noteEdit.orig.trim();
    if (!p.dirty && !p.noteInput.trim() && !unsavedEdit) return true;
    return confirmDiscard(
      p.dirty
        ? 'You have unsaved changes to this job. Discard them?'
        : unsavedEdit
          ? "You're part way through editing a note. Discard your changes?"
          : "You've typed a note but haven't added it. Discard it?",
    );
  };

  /** Opens a record in the detail pane, seeding the edit buffer from it. */
  const openRecord = (rec: JobRow) =>
    setPane(kind, {
      sel: rec.id,
      draft: false,
      draftClient: null,
      dirty: false,
      error: '',
      noteInput: '',
      noteEdit: null,
      form: formFromJob(rec, kind, null, null),
      formFor: rec.id,
    });

  const selectJob = async (id: string) => {
    const rec = recOf(id);
    if (!rec) return;
    if (!(await confirmDiscardJob())) return;
    openRecord(rec);
  };

  const newDraft = async (clientId?: string) => {
    if (kind === 'installs' && !isAdminOrOps(profile)) return; // techs log service tickets only
    if (!(await confirmDiscardJob())) return;
    setPane(kind, {
      sel: null,
      draft: true,
      draftClient: clientId ?? null,
      dirty: false,
      error: '',
      noteInput: '',
      noteEdit: null,
      // Techs are always assigned the jobs they log
      form: formFromJob(null, kind, clientId ?? null, isAdminOrOps(profile) ? null : (user?.id ?? null)),
      formFor: '',
    });
  };

  const cancelDraft = () =>
    setPane(kind, {
      draft: false,
      dirty: false,
      error: '',
      noteInput: '',
      form: null,
      formFor: null,
    });

  /** Marks one field changed. Only ever touches the buffer, never re-seeds the pane. */
  const setField = <K extends keyof JobForm>(field: K, value: JobForm[K]) => {
    const p = getPane(kind);
    if (!p.form) return;
    setPane(kind, { form: { ...p.form, [field]: value }, dirty: true });
  };

  const openClient = async (clientId: string) => {
    if (!(await confirmDiscardJob())) return;
    navigate(`/client/${clientId}`);
  };

  const deleteJob = async (id: string) => {
    if (!confirm('Delete this job?')) return;
    try {
      const { error } = await sb.from('jobs').delete().eq('id', id);
      if (error) throw error;
      await logAudit('deleted', 'jobs', id, {}, {});
      setPane(kind, { sel: null, draft: false, dirty: false, form: null, formFor: null });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast('Job deleted');
    } catch (e) {
      toast(`Delete failed: ${(e as Error).message}`, 'error');
    }
  };

  /**
   * A new install always has numbers to port, so its porting ticket is logged up front.
   * Ticket number and carrier are not known yet: TBC plus a blank carrier, which the
   * Porting pane then insists on at the first save. Never throws — the job is already
   * saved, and a "Save failed" here would invite a retry that duplicates it.
   */
  const createInstallPorting = async (clientId: string) => {
    try {
      const payload = {
        phone_numbers: 'TBC',
        losing_carrier: '',
        port_date: null,
        port_time: null,
        status: 'Pending',
        notes: 'Auto-created from new install',
      };
      const { data: row, error } = await sb
        .from('porting')
        .insert({ ...payload, client_id: clientId, created_by: user?.id })
        .select('*,clients(company,account_number)')
        .single();
      if (error) throw error;
      await logAudit('created', 'porting', row.id, {}, { ...payload, client_id: clientId });
      void queryClient.invalidateQueries({ queryKey: ['porting'] });
      return true;
    } catch (e) {
      console.warn('Install porting ticket failed:', e);
      return false;
    }
  };

  const saveJob = async () => {
    const store = getStore();
    if (store.saving || store.noteSaving) return;
    const p = getPane(kind);
    const f = p.form;
    if (!f) return;
    const rec = p.draft ? null : recOf(p.sel);
    if (!rec && !p.draft) return;

    // Whatever is in the notes box goes in with the save: a new job's first note, or
    // another one on an existing job
    const typedNote = p.noteInput.trim();
    // Only a note typed: just add it, without an empty "updated" entry in the audit log
    if (rec && !p.dirty) {
      if (!typedNote) return;
      const ok = await insertJobNote(rec.id, typedNote, user?.id);
      if (ok) {
        setPane(kind, { noteInput: '' });
        void queryClient.invalidateQueries({ queryKey: ['jobNotes', rec.id] });
        void queryClient.invalidateQueries({ queryKey: ['jobs'] });
        toast('Note added');
      } else {
        toast("The note couldn't be saved. Press Add note to retry", 'warn');
      }
      return;
    }

    const isInstall = f.type === 'New Install';
    const title = f.title.trim();
    const url = isInstall ? null : f.ticket_url.trim() || null;
    const clientId = p.draft ? f.client_id : rec!.client_id;
    const assigned = p.draft && !isAdminOrOps(profile) ? (user?.id ?? null) : f.assigned_to || null;

    const fail = (m: string) => setPane(kind, { error: m });
    setPane(kind, { error: '' });
    if (p.draft && !clientId) return fail('Please select a client.');
    if (!isInstall && !title) return fail('Job title is required.');
    if (isInstall && !f.approval_date && !rec?.legacy)
      return fail('Approval date is required for new installs.');
    if (!isInstall && f.status === 'Cancelled') return fail('Only new installs can be cancelled.');
    if (url && !safeTicketUrl(url)) return fail('Ticket link must start with http:// or https://.');

    const payload: Partial<Job> = {
      title: title || null,
      type: f.type,
      ticket_url: url,
      status: f.status,
      site_id: f.site_id || null,
      assigned_to: assigned,
      due_date: f.due_date || null,
      cost: isInstall ? null : f.cost ? Number(f.cost) : null,
      approval_date: isInstall ? f.approval_date || null : null,
      svc_internet: isInstall && f.svc_internet,
      svc_webex: isInstall && f.svc_webex,
      svc_nec: isInstall && f.svc_nec,
      description: f.description.trim(),
      // job_notes is no longer written: the old text box is read-only history under the log
    };

    // Created / Created by go in only when an admin changed them: the picker is to the
    // minute, so always sending it would trim the seconds and log a change nobody made
    if (rec && !isInstall && isAdmin(profile)) {
      const seeded = formFromJob(rec, kind, null, null);
      if (f.created_at && f.created_at !== seeded.created_at)
        payload.created_at = new Date(f.created_at).toISOString();
      if ((f.created_by || null) !== (rec.created_by ?? null))
        payload.created_by = f.created_by || null;
    }

    setStore({ saving: true });
    let noteFailed = false;
    try {
      let saved: JobRow;
      if (rec) {
        // Capture the pre-edit values so the audit log can show a real field-level diff
        const oldData: Record<string, unknown> = {};
        (Object.keys(payload) as (keyof Job)[]).forEach((k) => {
          oldData[k] = rec[k];
        });
        const { error } = await sb.from('jobs').update(payload).eq('id', rec.id);
        if (error) throw error;
        await logAudit('updated', 'jobs', rec.id, oldData, payload);
        if (assigned && assigned !== oldData.assigned_to)
          await sendAssignmentEmail(
            { title: payload.title ?? null, type: payload.type ?? null, due_date: payload.due_date ?? null },
            profiles.find((u) => u.id === assigned),
            rec.clients?.company ?? '',
            profile?.full_name,
          );
        saved = { ...rec, ...payload } as JobRow;
        const noteOk = typedNote ? await insertJobNote(rec.id, typedNote, user?.id) : true;
        noteFailed = !noteOk;
        if (!noteOk)
          toast(
            "Job updated, but the note couldn't be saved. It's still in the notes box: press Add note to retry",
            'warn',
          );
        else toast(typedNote ? 'Job updated · note added' : 'Job updated');
      } else {
        const { data: row, error } = await sb
          .from('jobs')
          .insert({ ...payload, client_id: clientId, created_by: user?.id })
          .select(
            '*,clients(company,account_number),sites(name),profiles!jobs_assigned_to_fkey(full_name)',
          )
          .single();
        if (error) throw error;
        saved = row as unknown as JobRow;
        await logAudit('created', 'jobs', saved.id, {}, { ...payload, client_id: clientId });
        if (assigned)
          await sendAssignmentEmail(
            saved,
            profiles.find((u) => u.id === assigned),
            saved.clients?.company ?? '',
            profile?.full_name,
          );
        const portOk = isInstall ? await createInstallPorting(clientId) : true;
        const noteOk = typedNote ? await insertJobNote(saved.id, typedNote, user?.id) : true;
        noteFailed = !noteOk;
        // One toast: they stack in the same spot, so a second would hide the first
        const done = [
          'Job logged',
          isInstall && portOk && 'porting ticket created (TBC)',
          typedNote && noteOk && 'note added',
        ]
          .filter(Boolean)
          .join(' · ');
        const missed = [!portOk && 'the porting ticket', !noteOk && 'the note']
          .filter(Boolean)
          .join(' and ');
        if (missed)
          toast(
            `Job logged, but ${missed} couldn't be saved${noteOk ? '' : '. The note is back in the notes box: press Add note to retry'}`,
            'warn',
          );
        else toast(done);
      }

      // Flipping Type moves the record onto the other page — follow the selection there
      const destKind = jobKindOf(saved);
      // A note that went in leaves the box; one that failed travels with the record,
      // which also swings the pane round to the notes tab so it is not lost from view
      const cleared: Partial<JobPane> = {
        sel: null,
        draft: false,
        dirty: false,
        error: '',
        form: null,
        formFor: null,
        noteInput: '',
        noteEdit: null,
      };
      const opened: Partial<JobPane> = {
        sel: saved.id,
        draft: false,
        dirty: false,
        error: '',
        noteInput: noteFailed ? typedNote : '',
        noteEdit: null,
        form: formFromJob(saved, destKind, null, null),
        formFor: saved.id,
        ...(noteFailed ? { tab: 'notes' as const } : {}),
      };
      setPanes(
        destKind === kind
          ? { installs: kind === 'installs' ? opened : {}, service: kind === 'service' ? opened : {} }
          : {
              installs: destKind === 'installs' ? opened : cleared,
              service: destKind === 'service' ? opened : cleared,
            },
      );
      if (destKind !== kind) toast(`Moved to ${JOB_KINDS[destKind].heading}`);

      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      void queryClient.invalidateQueries({ queryKey: ['jobNotes', saved.id] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client', saved.client_id] });
    } catch (e) {
      toast(`Save failed: ${(e as Error).message}`, 'error');
    } finally {
      setStore({ saving: false });
    }
    return undefined;
  };

  return {
    confirmDiscardJob,
    openRecord,
    selectJob,
    newDraft,
    cancelDraft,
    setField,
    openClient,
    deleteJob,
    saveJob,
  };
}
