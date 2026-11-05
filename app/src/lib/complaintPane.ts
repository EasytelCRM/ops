import { useSyncExternalStore } from 'react';
import type { NoteEdit } from './notes';
import { today } from './format';
import type { Complaint } from './db.types';

export const COMPLAINT_SELECT =
  '*,clients(company,account_number),profiles!complaints_assigned_to_fkey(full_name)';

export type ComplaintRow = Complaint & {
  clients: { company: string | null; account_number: string | null } | null;
  profiles: { full_name: string | null } | null;
};

export const COMPLAINT_STATUSES = ['Pending', 'Closed'] as const;

/** Mirrors the fetch order: newest open date first. */
export function sortComplaints<T extends Pick<Complaint, 'open_date' | 'created_at'>>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      (b.open_date || '').localeCompare(a.open_date || '') ||
      (b.created_at || '').localeCompare(a.created_at || ''),
  );
}

export interface ComplaintForm {
  client_id: string;
  tio_ref: string;
  complainant: string;
  open_date: string;
  closed_date: string;
  status: string;
  assigned_to: string;
  description: string;
}

interface Store {
  filter: string;
  search: string;
  sel: string | null;
  draft: boolean;
  dirty: boolean;
  saving: boolean;
  noteSaving: boolean;
  form: ComplaintForm | null;
  formFor: string | null;
  noteInput: string;
  noteEdit: NoteEdit | null;
  tab: 'desc' | 'notes';
  error: string;
}

let store: Store = {
  filter: 'Pending',
  search: '',
  sel: null,
  draft: false,
  dirty: false,
  saving: false,
  noteSaving: false,
  form: null,
  formFor: null,
  noteInput: '',
  noteEdit: null,
  tab: 'desc',
  error: '',
};

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getComplaint = () => store;

export function setComplaint(patch: Partial<Store>) {
  store = { ...store, ...patch };
  listeners.forEach((l) => l());
}

export const useComplaintPane = () => useSyncExternalStore(subscribe, getComplaint);

export function formFromComplaint(
  rec: ComplaintRow | null,
  draftClient: string | null,
): ComplaintForm {
  return {
    client_id: rec?.client_id ?? draftClient ?? '',
    tio_ref: rec?.tio_ref ?? '',
    complainant: rec?.complainant ?? '',
    // A new complaint opens today; an existing one keeps whatever it has.
    // today() is the UTC date, as the single-file app's was — kept rather than quietly
    // corrected to local, which would change what the field reads before 11am in Sydney.
    open_date: rec ? (rec.open_date ?? '') : today(),
    closed_date: rec?.closed_date ?? '',
    status: rec?.status ?? 'Pending',
    assigned_to: rec?.assigned_to ?? '',
    description: rec?.description ?? '',
  };
}

export const complaintHasUnsavedWork = () =>
  store.saving ||
  store.noteSaving ||
  store.dirty ||
  store.draft ||
  !!store.noteEdit ||
  !!store.noteInput.trim();
