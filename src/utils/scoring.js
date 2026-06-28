// Client mirror of api/_lib/scoring.js — keep in lock-step with calcPoints,
// the stage-points matrix, the regulation-time resolver, and the exact-score
// streak bonus rules. Used by PlayerScoreModal only.
//
// Knockout scoring uses ONLY the regulation-time score (90' + added time).
// Extra time and penalties never affect points. If a knockout match went to
// ET/penalties but no regulation score is available, the match is unresolved
// (0 pts, no exact/correct credit) and a warning is logged.

const STAGE_POINTS = {
  GROUP_STAGE:    { correct: 1, exact: 3,  exactHighScoring: 5 },
  ROUND_OF_32:    { correct: 2, exact: 4,  exactHighScoring: 6 },
  ROUND_OF_16:    { correct: 2, exact: 5,  exactHighScoring: 7 },
  QUARTER_FINALS: { correct: 3, exact: 7,  exactHighScoring: 9 },
  SEMI_FINALS:    { correct: 4, exact: 9,  exactHighScoring: 11 },
  THIRD_PLACE:    { correct: 4, exact: 9,  exactHighScoring: 11 },
  FINAL:          { correct: 5, exact: 12, exactHighScoring: 15 },
};

const POINTS = {
  HIGH_SCORING_MIN: 4,
  EXACT_SCORE_BONUS_MIN: 3,
  EXACT_SCORE_BONUS: 3,
};

function stagePoints(stage) {
  return STAGE_POINTS[stage] || STAGE_POINTS.GROUP_STAGE;
}

function outcome(home, away) {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

const _unresolvedLogged = new Set();
function logUnresolvedKnockoutOnce(match) {
  const matchId = match?.id ?? '?';
  if (_unresolvedLogged.has(String(matchId))) return;
  _unresolvedLogged.add(String(matchId));
  console.warn('[scoring] knockout match went to ET/penalties but no regulation score available', {
    matchId,
    stage: match?.stage ?? null,
    homeTeam: match?.homeTeam?.name ?? match?.homeTeam?.shortName ?? null,
    awayTeam: match?.awayTeam?.name ?? match?.awayTeam?.shortName ?? null,
    fullTime: match?.score?.fullTime ?? null,
    source: match?._liveSource ?? null,
    wentToExtraTime: !!match?.score?.wentToExtraTime,
    decidedByPenalties: !!match?.score?.decidedByPenalties,
  });
}

export function resolveScoringResult(match) {
  const stage = match?.stage || 'GROUP_STAGE';
  const isKnockout = stage !== 'GROUP_STAGE';
  const reg = match?.score?.regulation;
  const hasReg = reg && reg.home != null && reg.away != null;
  const wentToET = !!(match?.score?.wentToExtraTime || match?.score?.decidedByPenalties);

  if (isKnockout) {
    if (hasReg) return reg;
    if (wentToET) {
      logUnresolvedKnockoutOnce(match);
      return null;
    }
    return match?.score?.fullTime ?? null;
  }
  if (hasReg) return reg;
  return match?.score?.fullTime ?? null;
}

export function calcMatchPoints(pred, match) {
  const actual = resolveScoringResult(match);
  if (!actual || actual.home == null || actual.away == null) {
    return { points: 0, exact: false, correct: false };
  }

  const actualHome = actual.home;
  const actualAway = actual.away;
  const sp = stagePoints(match?.stage);

  if (pred.home === actualHome && pred.away === actualAway) {
    const totalGoals = actualHome + actualAway;
    const points = totalGoals >= POINTS.HIGH_SCORING_MIN ? sp.exactHighScoring : sp.exact;
    return { points, exact: true, correct: true };
  }

  if (outcome(pred.home, pred.away) === outcome(actualHome, actualAway)) {
    return { points: sp.correct, exact: false, correct: true };
  }

  return { points: 0, exact: false, correct: false };
}

// One-time +3 when the user hits 3 consecutive exact scores (kickoff order).
// Unresolved knockout matches break the streak — same as a wrong/missing pick.
export function computeExactScoreBonus(finishedMatches, predByMatchId) {
  let consecutiveExact = 0;
  let earned = false;

  for (const match of finishedMatches) {
    const pred = predByMatchId.get(String(match.id));
    if (!pred) {
      consecutiveExact = 0;
      continue;
    }
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

export { STAGE_POINTS, stagePoints, POINTS };
