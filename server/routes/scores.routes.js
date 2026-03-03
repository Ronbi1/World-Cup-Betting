const express = require('express');
const { supabase } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminOnly');
const { FOOTBALL_API_BASE, COMPETITION_CODE } = require('../config/football'); // SMELL-1 fix: shared config
const { fetchFootballApi } = require('./football.routes');              // SMELL-2 fix: shared cache + single-flight
require('dotenv').config();

const router = express.Router();

// ─── Scoring rules ────────────────────────────────────────────────────────────
//
//  Match predictions:
//    Exact score (≤4 total goals)  → 3 pts
//    Exact score (≥5 total goals)  → 5 pts  (3 base + 2 high-scoring bonus)
//    Correct result (not exact)    → 1 pt
//    Wrong result                  → 0 pts
//
//  Tournament bets (applied once at end of tournament):
//    Winning team   → 15 pts
//    Top scorer     →  5 pts
//    Top assist     →  5 pts
//
const POINTS = {
  EXACT_BASE:         3,
  HIGH_SCORING_BONUS: 2,  // added when total goals >= 5
  HIGH_SCORING_MIN:   5,  // threshold for total goals
  CORRECT_RESULT:     1,
  TOURNAMENT_WINNER:  15,
  TOP_SCORER:         5,
  TOP_ASSIST:         5,
};

// ─── Helper: derive outcome from a score pair ─────────────────────────────────
// Returns 'home' | 'away' | 'draw'
function outcome(home, away) {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

// ─── Core scoring logic (per match) ──────────────────────────────────────────
// Returns { points, exact, correct }
// Exported for unit testing (see integration.test.js).
function calcPoints(pred, match) {
  const actual = match.score?.fullTime;
  if (actual?.home === null || actual?.home === undefined) {
    return { points: 0, exact: false, correct: false };
  }

  const actualHome = actual.home;
  const actualAway = actual.away;

  // Exact score
  if (pred.home === actualHome && pred.away === actualAway) {
    const totalGoals = actualHome + actualAway;
    const bonus = totalGoals >= POINTS.HIGH_SCORING_MIN ? POINTS.HIGH_SCORING_BONUS : 0;
    return { points: POINTS.EXACT_BASE + bonus, exact: true, correct: true };
  }

  // Correct result (win/draw/loss) but wrong score
  if (outcome(pred.home, pred.away) === outcome(actualHome, actualAway)) {
    return { points: POINTS.CORRECT_RESULT, exact: false, correct: true };
  }

  return { points: 0, exact: false, correct: false };
}

// ─── Helper: fetch all finished WC matches via the shared cached football API ─
// SMELL-2 fix: uses fetchFootballApi (shared cache + single-flight) instead of
// a raw axios.get call — admin recalculations now benefit from the same cache
// that serves regular browser requests.
async function fetchFinishedMatches() {
  const url = `${FOOTBALL_API_BASE}/competitions/${COMPETITION_CODE}/matches?status=FINISHED`;
  const data = await fetchFootballApi(url);
  return data?.matches ?? [];
}

// ─── GET /scores ──────────────────────────────────────────────────────────────
// Returns the current saved scores for all approved users.
// Fast — just reads the scores column from the DB, no API call.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, scores')
      .eq('status', 'APPROVED')
      .eq('role', 'USER');

    if (error) throw error;

    const result = (data ?? []).map(u => ({
      userId:         u.id,
      name:           u.name,
      points:         u.scores?.points         ?? 0,
      correctResults: u.scores?.correctResults ?? 0,
      exactScores:    u.scores?.exactScores    ?? 0,
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /scores/recalculate ─────────────────────────────────────────────────
// Admin-only. Fetches all finished matches, tallies every user's predictions,
// optionally applies tournament bet bonuses, and writes results to DB.
//
// Body (all optional — only provide at end of tournament):
//   tournamentWinner  : string  — actual winning team name
//   actualTopScorer   : string  — actual top scorer name
//   actualTopAssist   : string  — actual top assist name
//
router.post('/recalculate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { tournamentWinner, actualTopScorer, actualTopAssist } = req.body ?? {};

    // 1. Fetch all finished matches (via shared cache — no extra API quota used)
    const finishedMatches = await fetchFinishedMatches();

    // Build a map: matchId (string) → match object
    const matchMap = {};
    for (const m of finishedMatches) {
      matchMap[String(m.id)] = m;
    }

    const finishedMatchIds = Object.keys(matchMap);

    // 2. Fetch all predictions for finished matches (skip if none finished yet)
    let predictions = [];
    if (finishedMatchIds.length > 0) {
      const { data, error: predError } = await supabase
        .from('predictions')
        .select('user_id, match_id, home, away')
        .in('match_id', finishedMatchIds);
      if (predError) throw predError;
      predictions = data ?? [];
    }

    // 3. Fetch all approved non-admin users (with their bets for tournament bonuses)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, bet')
      .eq('status', 'APPROVED')
      .eq('role', 'USER');

    if (usersError) throw usersError;

    // 4. Tally match prediction scores per user
    const userScores = {};
    for (const u of users) {
      userScores[u.id] = { points: 0, correctResults: 0, exactScores: 0 };
    }

    for (const pred of predictions) {
      const match = matchMap[String(pred.match_id)];
      if (!match) continue;

      const result = calcPoints(pred, match);
      if (!userScores[pred.user_id]) {
        userScores[pred.user_id] = { points: 0, correctResults: 0, exactScores: 0 };
      }
      userScores[pred.user_id].points         += result.points;
      if (result.correct) userScores[pred.user_id].correctResults += 1;
      if (result.exact)   userScores[pred.user_id].exactScores    += 1;
    }

    // 5. Apply tournament bet bonuses (only if actual results provided)
    const normalize = (s) => (s ?? '').trim().toLowerCase();

    for (const u of users) {
      if (!userScores[u.id]) continue;
      const bet = u.bet ?? {};

      if (tournamentWinner && normalize(bet.winningTeam) === normalize(tournamentWinner)) {
        userScores[u.id].points += POINTS.TOURNAMENT_WINNER;
      }
      if (actualTopScorer && normalize(bet.topScorer) === normalize(actualTopScorer)) {
        userScores[u.id].points += POINTS.TOP_SCORER;
      }
      if (actualTopAssist && normalize(bet.topAssist) === normalize(actualTopAssist)) {
        userScores[u.id].points += POINTS.TOP_ASSIST;
      }
    }

    // 6. Write scores back to each user row concurrently
    const updates = Object.entries(userScores).map(([userId, scores]) =>
      supabase.from('users').update({ scores }).eq('id', userId)
    );

    const results = await Promise.all(updates);
    const failedUpdates = results.filter(r => r.error).map(r => r.error.message);

    if (failedUpdates.length > 0) {
      console.error('[Scores] Some score updates failed:', failedUpdates);
    }

    console.log(`[Scores] Recalculated scores for ${Object.keys(userScores).length} users across ${finishedMatches.length} finished matches.`);

    // CRIT-3 fix: return HTTP 207 Multi-Status if some writes failed so the
    // frontend can warn the admin that the leaderboard may be partially stale.
    const statusCode = failedUpdates.length > 0 ? 207 : 200;

    res.status(statusCode).json({
      message: `Scores recalculated for ${Object.keys(userScores).length} users.`,
      finishedMatches: finishedMatches.length,
      updated: Object.keys(userScores).length,
      tournamentBonusesApplied: !!(tournamentWinner || actualTopScorer || actualTopAssist),
      // Only include the errors array when there are actual failures
      ...(failedUpdates.length > 0 && {
        warning: 'Some score updates failed — leaderboard may be partially stale.',
        errors: failedUpdates,
      }),
    });
  } catch (err) {
    next(err);
  }
});

// Export calcPoints for unit testing and router for index.js
module.exports = router;
module.exports.calcPoints = calcPoints;
