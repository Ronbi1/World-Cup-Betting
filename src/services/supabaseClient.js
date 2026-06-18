/**
 * Browser Supabase client — used ONLY for Realtime subscriptions to the
 * public matches_mirror table (live score/event push). All authenticated
 * data still goes through /api/* with the HttpOnly session cookie; this
 * client uses the anon key and never sees a user session.
 *
 * If VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set, this exports
 * null and the app falls back to the existing polling — no realtime, no error.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const isRealtimeEnabled = !!supabase;
