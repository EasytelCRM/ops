import { useSyncExternalStore } from 'react';
import type { NoteEdit } from './notes';
import type { JobKind, JobRow } from './jobs';
import { toLocalDateTime } from './format';

/**
 * The state of the two job panes, held outside React.
 *
 * In the single-file app these were module-level objects (`jobSel`, `jobDirty`,
 * `jobDraft`, `jobFilters`…) and the pages were divs toggled with `display`, so a trip
 * to the client list and back brought you to the same job, with your half-typed note
 * still in the box. Here the pages unmount on navigation, so the state has to live
 * somewhere that outlives them — which is this store.
 */

/** The detail pane's edit buffer. Strings throughout: these are form field values. */
export interface JobForm {
  type: string;
  status: string;
  title: string;
  ticket_url: string;
  client_id: string;
  site_id: string;
  assigned_to: string;
  due_date: string;
  cost: string;
  approval_date: string;
  svc_internet: boolean;
  svc_webex: boolean;
  svc_nec: boolean;
  description: string;
  /** Service tickets only, admin only: "YYYY-MM-DDTHH:MM" local. */
  created_at: string;
  created_by: string;
}

export interface JobPane {
  /** Status pill: one of the statuses, or 'all'. */
  filter: string;
  search: string;
  /** Job shown in the detail pane. */
  sel: string | null;
  /** The pane holds an unsaved new job. */
  draft: boolean;
  /** Client to preselect on a draft opened from a client profile. */
  draftClient: string | null;
  /** The pane has edits that are not saved. */
  dirty: boolean;
  form: JobForm | null;
  /** The record the form was seeded from; '' for a draft, null for nothing open. */
  formFor: string | null;
  /** Typed into the add-note box but not added yet. */
  noteInput: string;
  noteEdit: NoteEdit | null;
  tab: 'desc' | 'notes';
  /** Validation message under the form. */
  error: string;
}

interface Store {
  panes: Record<JobKind, JobPane>;
  /** Installs list: the "No Notes" pill, on top of the status filter. */
  noNotesOnly: boolean;
  /** A save is in flight; blocks repeat clicks on either page. */
  saving: boolean;
  /** A note insert/edit is in flight; blocks double-submits. */
  noteSaving: boolean;
}

const emptyPane = (): JobPane => ({
  filter: 'Pending',
  search: '',
  sel: null,
  draft: false,
  draftClient: null,
  dirty: false,
  form: null,
  formFor: null,
  noteInput: '',
  noteEdit: null,
  tab: 'desc',
  error: '',
});

let store: Store = {
  panes: { installs: emptyPane(), service: emptyPane() },
  noNotesOnly: false,
  saving: false,
  noteSaving: false,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getStore = () => store;
export const getPane = (kind: JobKind) => store.panes[kind];

export function setStore(patch: Partial<Omit<Store, 'panes'>>) {
  store = { ...store, ...patch };
  emit();
}

export function setPane(kind: JobKind, patch: Partial<JobPane>) {
  store = { ...store, panes: { ...store.panes, [kind]: { ...store.panes[kind], ...patch } } };
  emit();
}

/** Both panes at once — a save can move a record from one page to the other. */
export function setPanes(patch: Record<JobKind, Partial<JobPane>>) {
  store = {
    ...store,
    panes: {
      installs: { ...store.panes.installs, ...patch.installs },
      service: { ...store.panes.service, ...patch.service },
    },
  };
  emit();
}

export const useJobStore = () => useSyncExternalStore(subscribe, getStore);

/** The form values a record opens with. A draft starts blank, bar the fields it inherits. */
export function formFromJob(
  rec: JobRow | null,
  kind: JobKind,
  draftClient: string | null,
  techDraftUser: string | null,
): JobForm {
  const isInstall = (rec?.type ?? (kind === 'installs' ? 'New Install' : 'Service')) === 'New Install';
  return {
    type: rec?.type ?? (isInstall ? 'New Install' : 'Service'),
    status: rec?.status ?? 'Pending',
    title: rec?.title ?? '',
    ticket_url: rec?.ticket_url ?? '',
    client_id: rec?.client_id ?? draftClient ?? '',
    site_id: rec?.site_id ?? '',
    assigned_to: rec ? (rec.assigned_to ?? '') : (techDraftUser ?? ''),
    due_date: rec?.due_date ?? '',
    cost: rec?.cost != null ? String(rec.cost) : '',
    approval_date: rec?.approval_date ?? '',
    svc_internet: !!rec?.svc_internet,
    svc_webex: !!rec?.svc_webex,
    svc_nec: !!rec?.svc_nec,
    description: rec?.description ?? '',
    created_at: toLocalDateTime(rec?.created_at),
    created_by: rec?.created_by ?? '',
  };
}

/** Anything in this pane an automatic reload would throw away. */
export function paneHasUnsavedWork(): boolean {
  const s = store;
  if (s.saving || s.noteSaving) return true;
  return (['installs', 'service'] as JobKind[]).some((k) => {
    const p = s.panes[k];
    return p.dirty || p.draft || !!p.noteEdit || !!p.noteInput.trim();
  });
}
