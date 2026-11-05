import { useCallback, useEffect, useRef, useState } from 'react';
import { hasUnsavedWork } from '../lib/unsavedWork';

/**
 * GitHub Pages lets browsers reuse the page for 10 minutes, and a tab left open never
 * reloads, so the app looks for a newer deploy itself: at sign-in, every 5 minutes, and
 * whenever the tab comes back into view. It only reloads on its own when nothing would be
 * lost; otherwise a bar asks the user to save and reload.
 *
 * The single-file app re-fetched index.html and read its <meta name="version">. Vite emits
 * hash-named bundles, so the build writes version.json for this to read instead.
 */
export function useUpdateCheck(enabled: boolean) {
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const lastCheck = useRef(0);
  const started = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (newVersion || Date.now() - lastCheck.current < 60000) return null; // tab focus can fire in bursts
    lastCheck.current = Date.now();
    try {
      // A query string the CDN has not seen, plus no-store, so neither cache answers
      const res = await fetch(`${import.meta.env.BASE_URL}version.json?v=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const body = (await res.json()) as { version?: string };
      if (body.version && body.version !== __APP_VERSION__) {
        setNewVersion(body.version);
        return body.version;
      }
    } catch {
      /* offline or mid-deploy: try again next time */
    }
    return null;
  }, [newVersion]);

  const reloadForUpdate = useCallback(() => {
    // Keep the hash so the reload lands back on the page the user was looking at
    window.location.replace(`${window.location.pathname}?v=${Date.now()}${window.location.hash}`);
  }, []);

  const runUpdateCheck = useCallback(
    async (reloadIfSafe: boolean) => {
      const found = (await checkForUpdate()) ?? newVersion;
      if (!found) return;
      if (reloadIfSafe && !hasUnsavedWork()) reloadForUpdate();
    },
    [checkForUpdate, newVersion, reloadForUpdate],
  );

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;

    void runUpdateCheck(true); // catches a stale page served from the browser cache at open

    // While the user is looking at the tab, only offer the reload: it never jumps mid-task
    const timer = setInterval(() => void runUpdateCheck(document.visibilityState !== 'visible'), 5 * 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runUpdateCheck(true);
    };
    const onFocus = () => void runUpdateCheck(true);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, runUpdateCheck]);

  return { newVersion, reloadForUpdate };
}
