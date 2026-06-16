// Single-point selector between the live worldcup26 path and the
// Supabase mirror path. Every route that previously called fetchSeasonMatches
// / fetchTodayMatches / fetchFinishedMatches / fetchAllTeams now calls the
// equivalent here. Behaviour is identical to the live path when
// USE_MATCHES_MIRROR is not set to "true" — that's the default.
//
// Flag semantics:
//   USE_MATCHES_MIRROR === 'true' (exact string)  → read from mirror
//   anything else                                  → read from live upstream
//
// Simulation guard: simulation mode always uses the in-memory demo data
// regardless of the flag (the existing live fetchers already short-circuit
// when isSimulationMode() is true; we re-check here for defence in depth).

const live = require('./football');
const mirror = require('./matchesRepo');
const simulation = require('./simulation');

function useMirror() {
  // Look up isSimulationMode each call (not destructured) so vitest mocks
  // applied at runtime are observed. Also: simulation mode evaluation can
  // change between requests (env var driven), so dynamic is correct.
  if (simulation.isSimulationMode()) return false;
  return process.env.USE_MATCHES_MIRROR === 'true';
}

async function getSeasonMatches({ onTiming } = {}) {
  return useMirror() ? mirror.readAllMatches() : live.fetchSeasonMatches({ onTiming });
}

async function getTodayMatches({ onTiming } = {}) {
  return useMirror() ? mirror.readTodayMatches() : live.fetchTodayMatches({ onTiming });
}

async function getFinishedMatches({ onTiming } = {}) {
  return useMirror() ? mirror.readFinishedMatches() : live.fetchFinishedMatches({ onTiming });
}

async function getAllTeams({ onTiming } = {}) {
  return useMirror() ? mirror.readTeams() : live.fetchAllTeams({ onTiming });
}

module.exports = {
  useMirror,
  getSeasonMatches,
  getTodayMatches,
  getFinishedMatches,
  getAllTeams,
};
