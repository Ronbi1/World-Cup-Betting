const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth } = require('../_lib/auth');
const { bustGamesCache } = require('../_lib/football');
const { getFinishedMatches, useMirror } = require('../_lib/matchesSource');
const { computeSpotlight } = require('../_lib/spotlight');
const spotlightCache = require('../_lib/spotlightCache');
const { timeSupabase } = require('../_lib/requestTiming');
const {
  isSimulationMode,
  getSimulationUsers,
  getSimulationFinishedMatches,
  getSimulationPredictions,
} = require('../_lib/simulation');

const router = express.Router();

async function loadSpotlightInputs(req = null) {
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

  const onTiming = ({ ms, ok, source }) => {
    if (req?.timing) req.timing.markUpstream({ label: 'wc26.games', ms, ok, source });
  };

  const { data: usersRaw, error: usersError } = await timeSupabase(
    req,
    'users.approved',
    () => supabase
      .from('users')
      .select('id, name')
      .eq('status', 'APPROVED')
      .eq('role', 'USER'),
  );
  if (usersError) throw usersError;
  const users = usersRaw ?? [];

  // Uses matchesSource: mirror or live based on USE_MATCHES_MIRROR.
  const finishedMatches = await getFinishedMatches({ onTiming });
  const finishedMatchIds = finishedMatches.map((m) => String(m.id));

  let predictions = [];
  if (finishedMatchIds.length > 0) {
    const { data, error: predError } = await timeSupabase(
      req,
      'predictions.byFinishedMatchIds',
      () => supabase
        .from('predictions')
        .select('user_id, match_id, home, away')
        .in('match_id', finishedMatchIds),
    );
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
    req.timing?.note('refresh', forceRefresh);
    if (forceRefresh) {
      spotlightCache.bust();
      // bustGamesCache only matters in live mode; the mirror path always
      // reads the latest committed Supabase rows.
      if (!isSimulationMode() && !useMirror()) bustGamesCache();
    }
    req.timing?.note('source', useMirror() ? 'mirror' : 'live');

    const cached = spotlightCache.read();
    if (cached) {
      req.timing?.note('cacheHit', true);
      return res.json(cached);
    }
    req.timing?.note('cacheHit', false);

    const { users, finishedMatches, predictions } = await loadSpotlightInputs(req);
    req.timing?.note('users', users.length);
    req.timing?.note('finishedMatches', finishedMatches.length);
    req.timing?.note('predictions', predictions.length);
    const payload = computeSpotlight({ users, finishedMatches, predictions });

    spotlightCache.write(payload);
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
