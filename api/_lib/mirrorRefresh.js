// Shared refresh logic for matches_mirror + teams_mirror. The cron route
// (/api/cron/refresh-matches) and the admin backfill route
// (/api/admin/mirror-backfill) both call refreshMirror() — no second code
// path. This is the only place the mirror is written.
//
// HARD WRITE-SCOPE GUARANTEE (enforced by tests/mirrorRefresh.writeScope.test.js):
//   * Writes ONLY to matches_mirror and teams_mirror.
//   * Reads ONLY from worldcup26.ir via the existing wc26 helpers and from
//     matches_mirror (for the inserted-vs-updated delta).
//   * NEVER writes to users, predictions, prediction_edits, tournamentBonus,
//     users.scores, users.bet, or any existing scoring-related field.
//   * NEVER calls /api/scores/recalculate or any function from scoring.js.
//   * scoring.js is NOT imported here.

const { supabase: defaultSupabase } = require('./supabase');
const defaultFootball = require('./football');

// Dependencies are injectable to keep this function unit-testable WITHOUT
// touching the network or Supabase. Production callers pass nothing —
// defaults match the existing behaviour.
async function refreshMirror({
  supabase = defaultSupabase,
  fetchSeasonMatches = defaultFootball.fetchSeasonMatches,
  fetchAllTeams = defaultFootball.fetchAllTeams,
} = {}) {
  const startedAt = Date.now();
  const errors = [];

  // 1) Source — reuse the existing fetch + normalization. This is the same
  //    transformGame / transformTeam output the live routes return today, so
  //    the mirror is byte-equivalent.
  const normalizedMatches = await fetchSeasonMatches();
  const normalizedTeams = await fetchAllTeams();

  // 2) Compute insert-vs-update deltas by pre-reading the existing IDs.
  //    Cheap (one indexed select per table).
  const [{ data: existingMatchIdsRaw, error: existingMatchErr }, { data: existingTeamIdsRaw, error: existingTeamErr }] = await Promise.all([
    supabase
      .from('matches_mirror')
      .select('id, status, home_score, away_score, time_elapsed, normalized'),
    supabase.from('teams_mirror').select('id'),
  ]);
  if (existingMatchErr) throw existingMatchErr;
  if (existingTeamErr) throw existingTeamErr;
  const existingMatchIds = new Set((existingMatchIdsRaw ?? []).map((r) => r.id));
  const existingTeamIds = new Set((existingTeamIdsRaw ?? []).map((r) => r.id));

  // Live/finished matches are owned by the /api/cron/live-scores tick. The
  // schedule refresh must NOT revert their dynamic fields (score/status/time/
  // normalized) back to a possibly-staler worldcup26 snapshot. We keep those
  // columns as-is for any match already past kickoff, and only refresh the
  // schedule/team metadata. SCHEDULED matches (and brand-new rows) take the
  // upstream values as before.
  const existingMatchById = new Map((existingMatchIdsRaw ?? []).map((r) => [r.id, r]));
  const LIVE_OWNED = new Set(['IN_PLAY', 'PAUSED', 'FINISHED']);

  // 3) Project rows. We store the entire transformGame output in `normalized`
  //    so the read side can reconstruct the wire shape verbatim. The flat
  //    columns exist only for indexing.
  const nowIso = new Date().toISOString();

  const matchRows = normalizedMatches.map((m) => {
    // Schedule/team metadata — always refreshed from upstream.
    const row = {
      id: m.id,
      utc_date: m.utcDate,
      status: m.status,
      stage: m.stage,
      group: m.group,
      home_team_id: m.homeTeam?.id ?? null,
      home_team_name: m.homeTeam?.name ?? null,
      home_team_short_name: m.homeTeam?.shortName ?? null,
      home_team_tla: m.homeTeam?.tla ?? null,
      home_team_crest: m.homeTeam?.crest ?? null,
      away_team_id: m.awayTeam?.id ?? null,
      away_team_name: m.awayTeam?.name ?? null,
      away_team_short_name: m.awayTeam?.shortName ?? null,
      away_team_tla: m.awayTeam?.tla ?? null,
      away_team_crest: m.awayTeam?.crest ?? null,
      home_score: m.score?.fullTime?.home ?? null,
      away_score: m.score?.fullTime?.away ?? null,
      matchday: m.matchday ?? null,
      time_elapsed: m.timeElapsed ?? null,
      normalized: m,
      source_updated_at: null,
      mirror_updated_at: nowIso,
    };

    // Preserve the live tick's dynamic fields for any match it owns.
    const existing = existingMatchById.get(m.id);
    if (existing && LIVE_OWNED.has(existing.status)) {
      row.status = existing.status;
      row.home_score = existing.home_score;
      row.away_score = existing.away_score;
      row.time_elapsed = existing.time_elapsed;
      row.normalized = existing.normalized;
    }
    return row;
  });

  const teamRows = normalizedTeams.map((t) => ({
    id: t.id,
    name: t.name,
    short_name: t.shortName ?? null,
    tla: t.tla ?? null,
    crest: t.crest ?? null,
    founded: t.founded ?? null,
    venue: t.venue ?? null,
    normalized: t,
    mirror_updated_at: nowIso,
  }));

  // 4) Upsert. ONLY matches_mirror and teams_mirror. No other table touched.
  if (matchRows.length > 0) {
    const { error } = await supabase
      .from('matches_mirror')
      .upsert(matchRows, { onConflict: 'id' });
    if (error) {
      errors.push({ table: 'matches_mirror', message: error.message });
      throw error;
    }
  }
  if (teamRows.length > 0) {
    const { error } = await supabase
      .from('teams_mirror')
      .upsert(teamRows, { onConflict: 'id' });
    if (error) {
      errors.push({ table: 'teams_mirror', message: error.message });
      throw error;
    }
  }

  const matchInserted = matchRows.filter((r) => !existingMatchIds.has(r.id)).length;
  const teamInserted = teamRows.filter((r) => !existingTeamIds.has(r.id)).length;

  return {
    matches: {
      inserted: matchInserted,
      updated: matchRows.length - matchInserted,
      total: matchRows.length,
    },
    teams: {
      inserted: teamInserted,
      updated: teamRows.length - teamInserted,
      total: teamRows.length,
    },
    ms: Date.now() - startedAt,
    errors,
  };
}

module.exports = { refreshMirror };
