// Read-only library over matches_mirror + teams_mirror.
//
// HARD CONTRACT:
//   * Pure reads. Zero writes. Zero mutations.
//   * No scoring logic.
//   * Returns objects in the EXACT shape transformGame / transformTeam
//     produces (the `normalized` JSONB column holds those objects verbatim),
//     so this is a drop-in replacement for fetchSeasonMatches /
//     fetchTodayMatches / fetchFinishedMatches / fetchAllTeams.
//
// scoring.js is NOT imported here.
//
// Each export accepts an optional `{ supabase }` arg for unit testing.
// Production callers pass nothing — defaults match existing behaviour.

const { supabase: defaultSupabase } = require('./supabase');

async function readAllMatches({ supabase = defaultSupabase } = {}) {
  const { data, error } = await supabase
    .from('matches_mirror')
    .select('normalized, utc_date')
    .order('utc_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.normalized);
}

async function readTodayMatches(arg1, arg2) {
  // Support both legacy positional Date arg and the new options object.
  let nowDate;
  let supabase;
  if (arg1 instanceof Date) {
    nowDate = arg1;
    supabase = arg2?.supabase ?? defaultSupabase;
  } else {
    nowDate = arg1?.nowDate ?? new Date();
    supabase = arg1?.supabase ?? defaultSupabase;
  }
  const all = await readAllMatches({ supabase });
  const today = nowDate.toISOString().slice(0, 10);
  return all.filter((m) => m.utcDate && m.utcDate.slice(0, 10) === today);
}

async function readFinishedMatches({ supabase = defaultSupabase } = {}) {
  const all = await readAllMatches({ supabase });
  return all.filter((m) => m.status === 'FINISHED');
}

async function readTeams({ supabase = defaultSupabase } = {}) {
  const { data, error } = await supabase
    .from('teams_mirror')
    .select('normalized')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.normalized);
}

async function getMirrorFreshness({ supabase = defaultSupabase } = {}) {
  const { data, error } = await supabase
    .from('matches_mirror')
    .select('mirror_updated_at')
    .order('mirror_updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return new Date(data.mirror_updated_at);
}

module.exports = {
  readAllMatches,
  readTodayMatches,
  readFinishedMatches,
  readTeams,
  getMirrorFreshness,
};
