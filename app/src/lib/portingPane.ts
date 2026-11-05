import { useSyncExternalStore } from 'react';
import type { PortingRow } from './porting';

/**
 * The Porting pane's state, held outside React for the same reason the job panes are:
 * the single-file app's pages were divs toggled with `display`, so leaving the page and
 * coming back brought you to the same ticket with your edits intact.
 */

export interface PortingForm {
  client_id: string;
  ticket_url: string;
  /** The ticket number as typed; 'TBC' is stored but shown blank. */
  phone_numbers: string;
  losing_carrier: string;
  port_date: string;
  port_time: string;
  status: string;
  notes: string;
}

interface Store {
  filter: string;
  search: string;
  sel: string | null;
  draft: boolean;
  dirty: boolean;
  saving: boolean;
  form: PortingForm | null;
  formFor: string | null;
  error: string;
  /** Shown under the ticket link when a pasted link carries no REQ number. */
  urlHint: string;
}

let store: Store = {
  filter: 'Pending',
  search: '',
  sel: null,
  draft: false,
  dirty: false,
  saving: false,
  form: null,
  formFor: null,
  error: '',
  urlHint: '',
};

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getPorting = () => store;

export function setPorting(patch: Partial<Store>) {
  store = { ...store, ...patch };
  listeners.forEach((l) => l());
}

export const usePortingPane = () => useSyncExternalStore(subscribe, getPorting);

export function formFromPorting(rec: PortingRow | null, draftClient: string | null): PortingForm {
  return {
    client_id: rec?.client_id ?? draftClient ?? '',
    ticket_url: rec?.ticket_url ?? '',
    phone_numbers: rec?.phone_numbers === 'TBC' ? '' : (rec?.phone_numbers ?? ''),
    losing_carrier: rec?.losing_carrier ?? '',
    port_date: rec?.port_date ?? '',
    port_time: rec?.port_time ?? '',
    status: rec?.status ?? 'Pending',
    notes: rec?.notes ?? '',
  };
}

export const portingHasUnsavedWork = () => store.saving || store.dirty || store.draft;
