import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { initialHash, sb } from '../lib/supabase';
import type { Profile } from '../lib/db.types';
import { isActiveStaff } from '../lib/roles';
import { setAuditIdentity } from '../lib/audit';
import { useToast } from './ToastProvider';

export const DEACTIVATED_MSG = 'This account has been deactivated. Contact an admin.';
export const PENDING_MSG =
  "Your account is waiting for an admin to approve it. Try again once you've been told it's active.";

export type Screen = 'loading' | 'login' | 'set-password' | 'app';

interface AuthValue {
  screen: Screen;
  user: User | null;
  profile: Profile | null;
  /** Error the boot sequence left on the login screen, e.g. a deactivated account. */
  bootError: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  setPassword: (pw: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({
  screen: 'loading',
  user: null,
  profile: null,
  bootError: null,
  signIn: async () => null,
  setPassword: async () => null,
  signOut: async () => {},
});

/** Resolve to `fallback` if the promise has not settled in `ms` — no auth call can hang the boot. */
const withTimeout = <T,>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([Promise.resolve(p), new Promise<T>((res) => setTimeout(() => res(fallback), ms))]);

/**
 * Module level, not a ref: the boot sequence consumes a single-use PKCE code, so it must
 * run once per page load even though StrictMode mounts the provider twice in development.
 */
let bootStarted = false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const toast = useToast();

  // Refs, not state: the auth listener reads these synchronously and must never see a stale copy.
  const recoveryFlow = useRef(false);
  const screenRef = useRef<Screen>('loading');

  const goTo = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreen(s);
  }, []);

  // Audit rows are written from plain functions all over the app; keep the identity
  // they attribute to in step with the session rather than threading it through.
  useEffect(() => {
    setAuditIdentity(user?.id, profile?.email ?? user?.email);
  }, [user, profile]);

  /**
   * Loads the signed-in user's profile and opens the app, or bounces a pending /
   * deactivated account back to the login screen with a reason. Mirrors initApp().
   */
  const openApp = useCallback(
    async (u: User) => {
      const { data: p } = await sb.from('profiles').select('*').eq('id', u.id).single();
      if (p && !isActiveStaff(p)) {
        await sb.auth.signOut();
        setBootError(p.deactivated_at ? DEACTIVATED_MSG : PENDING_MSG);
        goTo('login');
        return;
      }
      setProfile(p ?? null);
      setBootError(null);
      goTo('app');
    },
    [goTo],
  );

  // ── Ongoing session listener: fresh sign-ins, token refresh, sign-out.
  // Does NOT handle session restore on load — that is the getSession() call in the boot effect.
  useEffect(() => {
    const { data: listener } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session) {
        setUser(session.user);
      } else if (event === 'PASSWORD_RECOVERY') {
        recoveryFlow.current = true;
        setUser(session?.user ?? null);
        goTo('set-password');
      } else if (event === 'SIGNED_IN' && session) {
        setUser(session.user);
        if (recoveryFlow.current) {
          goTo('set-password');
        } else if (screenRef.current === 'login') {
          // Only act on fresh sign-ins from the login screen
          void openApp(session.user).catch(() => goTo('login'));
        }
      } else if (event === 'SIGNED_OUT') {
        recoveryFlow.current = false;
        setUser(null);
        setProfile(null);
        goTo('login');
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [goTo, openApp]);

  // ── One-time boot
  useEffect(() => {
    if (bootStarted) return;
    bootStarted = true;

    void (async () => {
      goTo('loading');

      // PKCE flow: newer Supabase sends ?code=xxx&type=recovery in query params
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const urlType = params.get('type');
      if (code) {
        recoveryFlow.current = urlType === 'recovery' || urlType === 'invite';
        const timedOut = {
          data: { user: null, session: null as Session | null },
          error: new Error('timeout'),
        } as unknown as Awaited<ReturnType<typeof sb.auth.exchangeCodeForSession>>;
        const { data, error } = await withTimeout(sb.auth.exchangeCodeForSession(code), 8000, timedOut);
        if (!error && recoveryFlow.current) {
          setUser(data?.session?.user ?? null);
          goTo('set-password');
          return;
        }
        if (!error && data?.session) {
          setUser(data.session.user);
          try {
            await openApp(data.session.user);
          } catch {
            goTo('login');
          }
          return;
        }
        goTo('login');
        return;
      }

      // Legacy implicit flow: the SDK clears the hash before this runs, so use initialHash
      // (captured before createClient). Flagging recovery is enough — the SIGNED_IN event the
      // SDK queued fires through the listener above, and that shows set-password.
      if (initialHash.includes('type=invite') || initialHash.includes('type=recovery')) {
        recoveryFlow.current = true;
      }

      // Normal load — read the cached session from localStorage (fast, no network call).
      // Never call refreshSession() by hand: Supabase refreshes silently and signals
      // TOKEN_REFRESHED, and calling it here races a refresh token already being consumed.
      const noSession = {
        data: { session: null as Session | null },
        error: null,
      } as unknown as Awaited<ReturnType<typeof sb.auth.getSession>>;
      const { data } = await withTimeout(sb.auth.getSession(), 5000, noSession);
      if (data?.session) {
        setUser(data.session.user);
        if (recoveryFlow.current) {
          goTo('set-password');
          return;
        }
        try {
          await openApp(data.session.user);
        } catch {
          goTo('login');
        }
      } else {
        goTo('login');
      }
    })();
  }, [goTo, openApp]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (!error) return null;
    // Deactivated accounts are banned in Supabase Auth
    return error.code === 'user_banned' || /banned/i.test(error.message) ? DEACTIVATED_MSG : error.message;
  }, []);

  const setPassword = useCallback(
    async (pw: string) => {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) return error.message;
      toast('Password set! Welcome to Easytel CRM.');
      recoveryFlow.current = false;
      const { data } = await sb.auth.getSession();
      if (data.session) await openApp(data.session.user);
      return null;
    },
    [openApp, toast],
  );

  const signOut = useCallback(async () => {
    await sb.auth.signOut();
    setUser(null);
    setProfile(null);
    goTo('login');
  }, [goTo]);

  return (
    <AuthContext.Provider value={{ screen, user, profile, bootError, signIn, setPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
