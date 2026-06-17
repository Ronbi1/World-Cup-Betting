// Client mirror of api/_lib/scoring.js — keep in lock-step with calcPoints
// and the exact-score streak bonus rules. Used by PlayerScoreModal only.

const POINTS = {
  EXACT_BASE: 3,
  HIGH_SCORING_BONUS: 2,
  HIGH_SCORING_MIN: 4,
  CORRECT_RESULT: 1,
  EXACT_SCORE_BONUS_MIN: 3,
  EXACT_SCORE_BONUS: 3,
};

function outcome(home, away) {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

export function calcMatchPoints(pred, match) {
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

// One-time +3 when the user hits 3 consecutive exact scores (kickoff order).
export function computeExactScoreBonus(finishedMatches, predByMatchId) {
  let consecutiveExact = 0;
  let earned = false;

  for (const match of finishedMatches) {
    const pred = predByMatchId.get(String(match.id)) ?? { home: 0, away: 0 };
    const { exact } = calcMatchPoints(pred, match);
    if (exact) {
      consecutiveExact += 1;
      if (consecutiveExact >= POINTS.EXACT_SCORE_BONUS_MIN) {
        earned = true;
      }
    } else {
      consecutiveExact = 0;
    }
  }

  return earned ? POINTS.EXACT_SCORE_BONUS : 0;
}
