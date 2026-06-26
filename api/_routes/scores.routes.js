const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth, requireAdmin, requireFreshAdmin } = require('../_lib/auth');
const { computeLeaderboard, readTournamentBonus } = require('../_lib/scoring');
const { getFinishedMatches, useMirror } = require('../_lib/matchesSource');
const { refreshLiveScores } = require('../_lib/liveScores');
const { bustGamesCache } = require('../_lib/football');
const leaderboardCache = require('../_lib/leaderboardCache');
const { timeSupabase } = require('../_lib/requestTiming');
const {
  isSimulationMode,
  getSimulationUsers,
  getSimulationFinishedMatches,
  getSimulationPredictions,
} = require('../_lib/simulation');

const router = express.Router();

// Leaderboard cache lives in api/_lib/leaderboardCache.js so cross-route
// callers (predictions admin-edit) can bust it without depending on this
// router. See the module's header for invalidation rules.

async function loadLeaderboardInputs(req = null) {
  // SIMULATION ONLY — in-memory demo data; never touches Supabase.
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

  // 1. Approved non-ADMIN users — these are the only rows that score.
  const { data: usersRaw, error: usersError } = await timeSupabase(
    req,
    'users.approved',
    () => supabase
      .from('users')
      .select('id, name, bet, scores')
      .eq('status', 'APPROVED')
      .eq('role', 'USER'),
  );
  if (usersError) throw usersError;
  const users = usersRaw ?? [];

  // 2. Finished matches — Supabase mirror when USE_MATCHES_MIRROR=true,
  //    otherwise live worldcup26 with the existing 30 s in-memory cache.
  //    Same return shape either way (transformGame objects).
  const finishedMatches = await getFinishedMatches({ onTiming });
  const finishedMatchIds = finishedMatches.map((m) => String(m.id));

  // 3. Predictions for finished matches — single query, all users.
  let predictions = [];
  if (finishedMatchIds.length > 0) {
    const { data, error: predError } = await timeSupabase(
      req,
      'predictions.byFinishedMatchIds',
      () => supabase
        .from('predictions')
        .select('user_id, match_id, home, away')
        .in('match_id', finishedMatchIds)
        // Supabase's PostgREST defaults to a 1000-row cap. With ~20 users ×
        // up to 104 matches we can cross that and silently drop predictions
        // — predictions for the most recently finished matches end up missing
        // and the leaderboard under-counts. 10 000 is ~5× the worst case for
        // this pool, single round-trip, no pagination required.
        .limit(10000),
    );
    if (predError) throw predError;
    predictions = data ?? [];
  }

  return { users, finishedMatches, predictions };
}

// GET /api/scores — leaderboard, dynamically computed from finished matches.
// READ-ONLY for the user/predictions tables. `?fresh=true` may call
// refreshLiveScores() (mirror mode) which writes only to matches_mirror —
// the same write scope the /api/cron/live-scores tick already has.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const fresh = req.query.fresh === 'true';

    if (fresh) {
      const tStart = Date.now();
      leaderboardCache.bust();
      if (!isSimulationMode()) {
        const t0 = Date.now();
        try {
          if (useMirror()) {
            await refreshLiveScores();
          } else {
            bustGamesCache();
          }
        } catch (err) {
          console.warn('[scores] fresh=true source refresh failed; continuing with current data', {
            error: err.message,
            ms: Date.now() - t0,
            mode: useMirror() ? 'mirror' : 'live',
          });
        }
      }
      req.timing?.note('cacheHit', false);
      req.timing?.note('fresh', true);
      req.timing?.note('source', useMirror() ? 'mirror' : 'live');

      const { users, finishedMatches, predictions } = await loadLeaderboardInputs(req);
      req.timing?.note('users', users.length);
      req.timing?.note('finishedMatches', finishedMatches.length);
      req.timing?.note('predictions', predictions.length);
      const leaderboard = computeLeaderboard({ users, finishedMatches, predictions });

      leaderboardCache.write(leaderboard);
      console.log('[scores] fresh=true ok', {
        ms: Date.now() - tStart,
        mode: useMirror() ? 'mirror' : 'live',
        users: users.length,
        finishedMatches: finishedMatches.length,
      });
      return res.json(leaderboard);
    }

    const cached = leaderboardCache.read();
    if (cached) {
      req.timing?.note('cacheHit', true);
      req.timing?.note('source', useMirror() ? 'mirror' : 'live');
      return res.json(cached);
    }
    req.timing?.note('cacheHit', false);
    req.timing?.note('source', useMirror() ? 'mirror' : 'live');

    const { users, finishedMatches, predictions } = await loadLeaderboardInputs(req);
    req.timing?.note('users', users.length);
    req.timing?.note('finishedMatches', finishedMatches.length);
    req.timing?.note('predictions', predictions.length);
    const leaderboard = computeLeaderboard({ users, finishedMatches, predictions });

    leaderboardCache.write(leaderboard);
    res.json(leaderboard);
  } catch (err) {
    next(err);
  }
});

// POST /api/scores/recalculate — admin: re-tally, persist snapshot, update
// tournament-bonus inputs. This is the ONLY write path on the scores route.
router.post('/recalculate', requireAuth, requireAdmin, requireFreshAdmin, async (req, res, next) => {
  try {
    if (isSimulationMode()) {
      return res.status(403).json({
        error: 'Simulation mode is read-only. Disable VITE_SIMULATION_MODE to recalculate real scores.',
      });
    }

    const { tournamentWinner, actualTopScorer, actualTopAssist } = req.body || {};

    const overrides = {
      winner: typeof tournamentWinner === 'string' && tournamentWinner.trim()
        ? tournamentWinner.trim()
        : undefined,
      topScorer: typeof actualTopScorer === 'string' && actualTopScorer.trim()
        ? actualTopScorer.trim()
        : undefined,
      topAssist: typeof actualTopAssist === 'string' && actualTopAssist.trim()
        ? actualTopAssist.trim()
        : undefined,
    };

    const { users, finishedMatches, predictions } = await loadLeaderboardInputs(req);

    // computeLeaderboard handles the merge of overrides + persisted bonuses.
    const leaderboard = computeLeaderboard({
      users,
      finishedMatches,
      predictions,
      tournamentOverrides: overrides,
    });
    const leaderboardById = new Map(leaderboard.map((row) => [row.userId, row]));

    // Per-user persisted snapshot. Tournament bonus values are the merged
    // result (override > previous persisted) so future recalcs without
    // overrides still see the last admin-supplied actuals.
    const updates = users.map((u) => {
      const row = leaderboardById.get(u.id)
        ?? { points: 0, correctResults: 0, exactScores: 0, exactScoreBonus: 0 };
      const persisted = readTournamentBonus(u);
      const nextBonus = {
        winner: overrides.winner ?? persisted.winner,
        topScorer: overrides.topScorer ?? persisted.topScorer,
        topAssist: overrides.topAssist ?? persisted.topAssist,
      };

      return supabase
        .from('users')
        .update({
          scores: {
            points: row.points,
            correctResults: row.correctResults,
            exactScores: row.exactScores,
            exactScoreBonus: row.exactScoreBonus ?? 0,
            tournamentBonus: nextBonus,
          },
        })
        .eq('id', u.id);
    });

    const results = await Promise.all(updates);
    const failedUpdates = results.filter((r) => r.error).map((r) => r.error.message);
    if (failedUpdates.length > 0) console.error('[scores] partial failures:', failedUpdates);

    leaderboardCache.bust();

    const statusCode = failedUpdates.length > 0 ? 207 : 200;
    res.status(statusCode).json({
      message: `Scores recalculated for ${users.length} users.`,
      finishedMatches: finishedMatches.length,
      updated: users.length,
      tournamentBonusesApplied: !!(overrides.winner || overrides.topScorer || overrides.topAssist),
      ...(failedUpdates.length > 0 && {
        warning: 'Some score updates failed — leaderboard may be partially stale.',
        errors: failedUpdates,
      }),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
