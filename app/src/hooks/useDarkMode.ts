import { useCallback, useState } from 'react';

/**
 * Dark is the default: only an explicit '0' in localStorage turns it off.
 * index.html applies the class before first paint; this hook only toggles it.
 */
export function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggle = useCallback(() => {
    const next = document.documentElement.classList.toggle('dark');
    try {
      localStorage.setItem('tcrm_dark', next ? '1' : '0');
    } catch {
      /* private window: the class still flipped, it just will not be remembered */
    }
    setDark(next);
  }, []);

  return { dark, toggle };
}
