// Single Supabase client (service-role key) used by every serverless function.
// The service-role key MUST live in Vercel env vars and never reach the browser.
//
// Lazy creation: building the client is deferred to first use so an
// importing module that never touches Supabase (e.g. a cold-loaded health
// check) can still load even if env vars are unset locally.
const { createClient } = require('@supabase/supabase-js');

let cached = null;

function getSupabase() {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var. Set them in ' +
        'Vercel project settings (or in .env for local dev).'
    );
  }

  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

// Backwards-compatible default: a Proxy that defers to the real client on
// first property access. Existing code can keep doing `supabase.from(...)`.
const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const real = getSupabase();
      const value = real[prop];
      return typeof value === 'function' ? value.bind(real) : value;
    },
  }
);

module.exports = { supabase, getSupabase };
