// Scoring rules — single source of truth shared by recalculate logic and
// any future test harness.
//
// Match predictions:
//   Exact score (≤3 total goals)  → 3 pts
//   Exact score (≥4 total goals)  → 5 pts (3 base + 2 high-scoring bonus)
//   Correct result (not exact)    → 1 pt
//   Wrong result                  → 0 pts
//
// Tournament bets (applied once, at end of tournament):
//   Winning team   → 15 pts
//   Top scorer     → 15 pts
//   Top assist     → 15 pts
//
// Leaderboard bonus (one-time, applied at compute time):
//   3 consecutive exact-score hits (in kickoff order) → +3 pts.
//   The bonus is awarded once and does NOT stack if the streak grows
//   beyond 3.
//
// Missing prediction handling:
//   A user who never saved a prediction for a finished match earns 0
//   points for that match. The match counts as a miss and breaks any
//   exact-score streak in progress — identical to a wrong prediction
//   for streak purposes.

const POINTS = {
  EXACT_BASE: 3,
  HIGH_SCORING_BONUS: 2,
  HIGH_SCORING_MIN: 4,
  CORRECT_RESULT: 1,
  TOURNAMENT_WINNER: 15,
  TOP_SCORER: 15,
  TOP_ASSIST: 15,
  EXACT_SCORE_BONUS_MIN: 3,
  EXACT_SCORE_BONUS: 3,
};

function outcome(home, away) {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

function calcPoints(pred, match) {
  const actual = match.score?.fullTime;
  if (actual?.home === null || actual?.home === undefined) {
    return { points: 0, exact: false, correct: false };
  }

  const actualHome = actual.home;
  const actualAway = actual.away;

  if (pred.home === actualHome && pred.away === actualAway) {
    const totalGoals = actualHome + actualAway;
    const bonus = totalGoals >= POINTS.HIGH_SCORING_MIN ? POINTS.HIGH_SCORING_BONUS : 0;
    return { points: POINTS.EXACT_BASE + bonus, exact: true, correct: true };
  }

  if (outcome(pred.home, pred.away) === outcome(actualHome, actualAway)) {
    return { points: POINTS.CORRECT_RESULT, exact: false, correct: true };
  }

  return { points: 0, exact: false, correct: false };
}

// Backward-compatible read of `users.scores.tournamentBonus`. Some users
// have `scores = null`, or `scores` without `tournamentBonus`, or
// `tournamentBonus` missing sub-fields. Never throws.
function readTournamentBonus(user) {
  const tb = user?.scores?.tournamentBonus;
  if (!tb || typeof tb !== 'object') {
    return { winner: null, topScorer: null, topAssist: null };
  }
  return {
    winner: typeof tb.winner === 'string' ? tb.winner : null,
    topScorer: typeof tb.topScorer === 'string' ? tb.topScorer : null,
    topAssist: typeof tb.topAssist === 'string' ? tb.topAssist : null,
  };
}

const normalize = (s) => (s ?? '').toString().trim().toLowerCase();

// Pure, single-pass, in-memory leaderboard compute. All inputs are arrays
// fetched ONCE at the call site; this function does no DB access. Missing
// predictions earn 0 points and break the exact-score streak. Tournament
// bonus is read from each user's persisted `users.scores.tournamentBonus`
// (safe-defaulted).
//
// Inputs:
//   users:           [{ id, name, bet, scores? }, ...]   APPROVED USER rows
//   finishedMatches: [{ id, score: { fullTime: { home, away } }, ... }, ...]
//   predictions:     [{ user_id, match_id, home, away }, ...] (only those that exist)
//   tournamentOverrides (optional): { winner?, topScorer?, topAssist? }
//     If provided (admin recalculate), values override the per-user
//     persisted bonus. Otherwise the per-user persisted bonus is used.
//
// Returns:
//   [{ userId, name, points, correctResults, exactScores, exactScoreBonus }, ...]
//   exactScoreBonus is 0 or POINTS.EXACT_SCORE_BONUS — already included in `points`.
function computeLeaderboard({ users, finishedMatches, predictions, tournamentOverrides = null }) {
  const safeUsers = Array.isArray(users) ? users : [];
  const safeMatches = (Array.isArray(finishedMatches) ? finishedMatches : [])
    .slice()
    .sort((a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0));
  const safePredictions = Array.isArray(predictions) ? predictions : [];

  // Build lookup maps once.
  const predByUserMatch = new Map();
  for (const p of safePredictions) {
    predByUserMatch.set(`${p.user_id}:${String(p.match_id)}`, p);
  }

  const result = [];

  for (const u of safeUsers) {
    let points = 0;
    let correctResults = 0;
    let exactScores = 0;
    let consecutiveExact = 0;
    let earnedExactBonus = false;

    for (const match of safeMatches) {
      const key = `${u.id}:${String(match.id)}`;
      const pred = predByUserMatch.get(key);
      // Missing prediction → 0 pts, no exact/correct credit, streak resets.
      if (!pred) {
        consecutiveExact = 0;
        continue;
      }
      const r = calcPoints(pred, match);
      points += r.points;
      if (r.correct) correctResults += 1;
      if (r.exact) {
        exactScores += 1;
        consecutiveExact += 1;
        if (consecutiveExact >= POINTS.EXACT_SCORE_BONUS_MIN) {
          earnedExactBonus = true;
        }
      } else {
        consecutiveExact = 0;
      }
    }

    // One-time exact-score streak bonus. Awarded when the user hits 3 exact
    // scores in a row; does NOT stack. Computed at the leaderboard level so
    // per-match scoring (calcPoints) stays untouched.
    const exactScoreBonus = earnedExactBonus ? POINTS.EXACT_SCORE_BONUS : 0;
    points += exactScoreBonus;

    // Tournament bonus: admin overrides win, otherwise read persisted.
    const persisted = readTournamentBonus(u);
    const winnerActual = tournamentOverrides?.winner ?? persisted.winner;
    const topScorerActual = tournamentOverrides?.topScorer ?? persisted.topScorer;
    const topAssistActual = tournamentOverrides?.topAssist ?? persisted.topAssist;

    const bet = u.bet ?? {};
    if (winnerActual && normalize(bet.winningTeam) === normalize(winnerActual)) {
      points += POINTS.TOURNAMENT_WINNER;
    }
    if (topScorerActual && normalize(bet.topScorer) === normalize(topScorerActual)) {
      points += POINTS.TOP_SCORER;
    }
    if (topAssistActual && normalize(bet.topAssist) === normalize(topAssistActual)) {
      points += POINTS.TOP_ASSIST;
    }

    result.push({
      userId: u.id,
      name: u.name,
      points,
      correctResults,
      exactScores,
      exactScoreBonus,
    });
  }

  return result;
}

module.exports = { POINTS, calcPoints, computeLeaderboard, readTournamentBonus };
