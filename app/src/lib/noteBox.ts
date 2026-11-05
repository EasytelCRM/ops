import { useSyncExternalStore } from 'react';

/**
 * Whether the add-note box is expanded, remembered per browser and shared by every
 * compose box on the page — the single-file app toggled them all at once so one on a
 * page that is not showing never goes stale.
 */

const KEY = 'tcrm_notebox_big';

let big = (() => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
})();

const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function setNoteBoxBig(next: boolean) {
  big = next;
  try {
    localStorage.setItem(KEY, next ? '1' : '');
  } catch {
    /* private window: the toggle still works, it just will not be remembered */
  }
  listeners.forEach((fn) => fn());
}

export const useNoteBoxBig = () => useSyncExternalStore(subscribe, () => big);
