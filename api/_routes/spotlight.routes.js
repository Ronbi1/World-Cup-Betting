const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth } = require('../_lib/auth');
const { fetchFinishedMatches, bustGamesCache } = require('../_lib/football');
const { computeSpotlight } = require('../_lib/spotlight');
const spotlightCache = require('../_lib/spotlightCache');
const {
  isSimulationMode,
  getSimulationUsers,
  getSimulationFinishedMatches,
  getSimulationPredictions,
} = require('../_lib/simulation');

const router = express.Router();

async function loadSpotlightInputs() {
  if (isSimulationMode()) {
    const finishedMatches = getSimulationFinishedMatches();
    const finishedMatchIds = new Set(finishedMatches.map((m) => String(m.id)));
    const predictions = getSimulationPredictions().filter(
      (p) => finishedMatchIds.has(String(p.match_id)),
    );
    return {
      users: getSimulationUsers(),
      finishedMatches,
      predictions,
    };
  }

  const { data: usersRaw, error: usersError } = await supabase
    .from('users')
    .select('id, name')
    .eq('status', 'APPROVED')
    .eq('role', 'USER');
  if (usersError) throw usersError;
  const users = usersRaw ?? [];

  const finishedMatches = await fetchFinishedMatches();
  const finishedMatchIds = finishedMatches.map((m) => String(m.id));

  let predictions = [];
  if (finishedMatchIds.length > 0) {
    const { data, error: predError } = await supabase
      .from('predictions')
      .select('user_id, match_id, home, away')
      .in('match_id', finishedMatchIds);
    if (predError) throw predError;
    predictions = data ?? [];
  }

  return { users, finishedMatches, predictions };
}

// GET /api/spotlight — daily exact-score hero + recent history.
// ?refresh=1 skips server cache (used when a match just finished).
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === '1';
    if (forceRefresh) {
      spotlightCache.bust();
      if (!isSimulationMode()) bustGamesCache();
    }

    const cached = spotlightCache.read();
    if (cached) return res.json(cached);

    const { users, finishedMatches, predictions } = await loadSpotlightInputs();
    const payload = computeSpotlight({ users, finishedMatches, predictions });

    spotlightCache.write(payload);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
