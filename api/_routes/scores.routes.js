const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth, requireAdmin } = require('../_lib/auth');
const { computeLeaderboard, readTournamentBonus } = require('../_lib/scoring');
const { fetchFinishedMatches } = require('../_lib/football');

const router = express.Router();

// ── Module-level cache for GET /api/scores ──────────────────────────────────
// GET is strictly read-only — it never writes to the DB. The cache absorbs
// concurrent requests (many users hitting the leaderboard at once) and keeps
// the upstream pressure on Supabase + worldcup26 low. The cache is busted
// whenever an admin runs POST /recalculate.
const LEADERBOARD_TTL_MS = 30_000;
let _leaderboardCache = { data: null, expiresAt: 0 };

function bustLeaderboardCache() {
  _leaderboardCache = { data: null, expiresAt: 0 };
}

async function loadLeaderboardInputs() {
  // 1. Approved non-ADMIN users — these are the only rows that score.
  const { data: usersRaw, error: usersError } = await supabase
    .from('users')
    .select('id, name, bet, scores')
    .eq('status', 'APPROVED')
    .eq('role', 'USER');
  if (usersError) throw usersError;
  const users = usersRaw ?? [];

  // 2. Finished matches from the football provider (cached upstream at 30 s).
  const finishedMatches = await fetchFinishedMatches();
  const finishedMatchIds = finishedMatches.map((m) => String(m.id));

  // 3. Predictions for finished matches — single query, all users.
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

// GET /api/scores — leaderboard, dynamically computed from finished matches.
// READ-ONLY: never writes to the database.
router.get('/', requireAuth, async (_req, res, next) => {
  try {
    const now = Date.now();
    if (_leaderboardCache.data && now < _leaderboardCache.expiresAt) {
      return res.json(_leaderboardCache.data);
    }

    const { users, finishedMatches, predictions } = await loadLeaderboardInputs();
    const leaderboard = computeLeaderboard({ users, finishedMatches, predictions });

    _leaderboardCache = {
      data: leaderboard,
      expiresAt: Date.now() + LEADERBOARD_TTL_MS,
    };

    res.json(leaderboard);
  } catch (err) {
    next(err);
  }
});

// POST /api/scores/recalculate — admin: re-tally, persist snapshot, update
// tournament-bonus inputs. This is the ONLY write path on the scores route.
router.post('/recalculate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
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

    const { users, finishedMatches, predictions } = await loadLeaderboardInputs();

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
      const row = leaderboardById.get(u.id) ?? { points: 0, correctResults: 0, exactScores: 0 };
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
            tournamentBonus: nextBonus,
          },
        })
        .eq('id', u.id);
    });

    const results = await Promise.all(updates);
    const failedUpdates = results.filter((r) => r.error).map((r) => r.error.message);
    if (failedUpdates.length > 0) console.error('[scores] partial failures:', failedUpdates);

    bustLeaderboardCache();

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

// Express expects the router itself as the default export (see
// `app.use('/api/scores', scoresRoutes)`). Expose the cache-bust helper as
// a property on the router so other modules can import it if needed.
router.bustLeaderboardCache = bustLeaderboardCache;
module.exports = router;
