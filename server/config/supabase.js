const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Uses the SERVICE ROLE key — bypasses Row Level Security.
// This key MUST stay server-side only and NEVER be exposed to the frontend.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      // Disable auto-refresh and session persistence — server doesn't need them
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

module.exports = { supabase };
