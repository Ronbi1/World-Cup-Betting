// Scoring rules — single source of truth shared by recalculate logic and
// any future test harness.
//
// Match predictions:
//   Exact score (≤4 total goals)  → 3 pts
//   Exact score (≥5 total goals)  → 5 pts (3 base + 2 high-scoring bonus)
//   Correct result (not exact)    → 1 pt
//   Wrong result                  → 0 pts
//
// Tournament bets (applied once, at end of tournament):
//   Winning team   → 15 pts
//   Top scorer     →  5 pts
//   Top assist     →  5 pts
//
// Missing prediction handling:
//   A user who never saved a prediction for a finished match is treated
//   as having predicted 0-0 (virtual default). No DB rows are created;
//   the default is materialized only at scoring time inside
//   `computeLeaderboard`.

const POINTS = {
  EXACT_BASE: 3,
  HIGH_SCORING_BONUS: 2,
  HIGH_SCORING_MIN: 5,
  CORRECT_RESULT: 1,
  TOURNAMENT_WINNER: 15,
  TOP_SCORER: 5,
  TOP_ASSIST: 5,
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
// predictions are treated as virtual 0-0. Tournament bonus is read from
// each user's persisted `users.scores.tournamentBonus` (safe-defaulted).
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
//   [{ userId, name, points, correctResults, exactScores }, ...]
function computeLeaderboard({ users, finishedMatches, predictions, tournamentOverrides = null }) {
  const safeUsers = Array.isArray(users) ? users : [];
  const safeMatches = Array.isArray(finishedMatches) ? finishedMatches : [];
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

    for (const match of safeMatches) {
      const key = `${u.id}:${String(match.id)}`;
      // Virtual 0-0 default if the user never saved a prediction.
      const pred = predByUserMatch.get(key) ?? { home: 0, away: 0 };
      const r = calcPoints(pred, match);
      points += r.points;
      if (r.correct) correctResults += 1;
      if (r.exact) exactScores += 1;
    }

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
    });
  }

  return result;
}

module.exports = { POINTS, calcPoints, computeLeaderboard, readTournamentBonus };
