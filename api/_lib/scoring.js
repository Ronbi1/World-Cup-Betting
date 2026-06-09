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

module.exports = { POINTS, calcPoints };
