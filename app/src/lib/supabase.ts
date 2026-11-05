import { createClient } from '@supabase/supabase-js';
import type { Database } from './db.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON;

if (!url || !anon) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON. Copy app/.env.example to app/.env.local for local dev.',
  );
}

/**
 * The hash has to be read before createClient: the SDK clears it while it
 * initialises, and the legacy implicit invite/recovery links carry their type in it.
 */
export const initialHash = window.location.hash;

export const sb = createClient<Database>(url, anon);
