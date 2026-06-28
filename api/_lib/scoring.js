// Scoring rules — single source of truth shared by recalculate logic and
// any future test harness.
//
// ─── Per-match prediction scoring ────────────────────────────────────────────
// Knockout stages scale up — see STAGE_POINTS below. Group-stage scoring is
// unchanged from the original 1/3/5 table so existing group-stage leaderboard
// totals do not shift after the migration.
//
//   Group stage         direction=1  exact=3  exact (≥4 goals)=5
//   Round of 32         direction=2  exact=4  exact (≥4 goals)=6
//   Round of 16         direction=2  exact=5  exact (≥4 goals)=7
//   Quarter-finals      direction=3  exact=7  exact (≥4 goals)=9
//   Semi-finals         direction=4  exact=9  exact (≥4 goals)=11
//   Third-place match   direction=4  exact=9  exact (≥4 goals)=11   (= semi)
//   Final               direction=5  exact=12 exact (≥4 goals)=15
//
// Unknown stage values fall back to GROUP_STAGE rates so a new upstream code
// cannot crash scoring.
//
// ─── Regulation-time only for knockout matches ───────────────────────────────
// Knockout scoring uses ONLY the score at the end of regulation time (90' +
// added time). Extra time and penalties never affect points, even if they
// decide the actual match. The live-scores cron freezes `match.score.regulation`
// from ESPN linescores at the end of period 2; later ticks don't overwrite it.
//   1-1 at 90' then 2-1 in ET  → scoring result is 1-1.
//   0-0 at 90' then PK winner  → scoring result is 0-0.
// If a knockout match went to ET/penalties but no regulation score is available,
// the match is treated as UNRESOLVED: 0 points, no exact/correct credit, the
// exact-streak counter does not advance, and a warning is logged once with
// match id, stage, teams, fullTime, source, and the ET/penalty flags.
//
// ─── Tournament bets (applied once, at end of tournament) ────────────────────
//   Winning team   → 15 pts
//   Top scorer     → 15 pts
//   Top assist     → 15 pts
//
// ─── Leaderboard bonus (one-time) ────────────────────────────────────────────
//   3 consecutive exact-score hits (in kickoff order) → +3 pts. The bonus is
//   awarded once and does NOT stack. Unresolved knockout matches reset the
//   streak (same as a wrong prediction).
//
// Missing prediction handling:
//   A user who never saved a prediction for a finished match earns 0 points
//   and the match breaks any in-progress exact-score streak.

const STAGE_POINTS = {
  GROUP_STAGE:    { correct: 1, exact: 3,  exactHighScoring: 5 },
  ROUND_OF_32:    { correct: 2, exact: 4,  exactHighScoring: 6 },
  ROUND_OF_16:    { correct: 2, exact: 5,  exactHighScoring: 7 },
  QUARTER_FINALS: { correct: 3, exact: 7,  exactHighScoring: 9 },
  SEMI_FINALS:    { correct: 4, exact: 9,  exactHighScoring: 11 },
  THIRD_PLACE:    { correct: 4, exact: 9,  exactHighScoring: 11 },
  FINAL:          { correct: 5, exact: 12, exactHighScoring: 15 },
};

const HIGH_SCORING_MIN = 4; // total goals threshold for the high-scoring tier

const POINTS = {
  HIGH_SCORING_MIN,
  TOURNAMENT_WINNER: 15,
  TOP_SCORER: 15,
  TOP_ASSIST: 15,
  EXACT_SCORE_BONUS_MIN: 3,
  EXACT_SCORE_BONUS: 3,
  // Group-stage rates kept as named constants for legacy tests and external
  // readers. New code should read STAGE_POINTS instead.
  EXACT_BASE: STAGE_POINTS.GROUP_STAGE.exact,
  HIGH_SCORING_BONUS: STAGE_POINTS.GROUP_STAGE.exactHighScoring - STAGE_POINTS.GROUP_STAGE.exact,
  CORRECT_RESULT: STAGE_POINTS.GROUP_STAGE.correct,
};

function stagePoints(stage) {
  return STAGE_POINTS[stage] || STAGE_POINTS.GROUP_STAGE;
}

function outcome(home, away) {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

// Log each unresolved knockout match at most once per process to avoid log
// spam from repeated leaderboard requests. Resets when the process restarts —
// that's fine: a fresh boot getting the warning again is a useful signal.
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

// Resolve the score used for scoring. Returns `null` when a knockout match is
// unresolved (went to ET/penalties but no regulation captured) — calcPoints
// then awards zero. Group-stage matches and knockout matches that did NOT go
// to ET fall back to fullTime, so the engine works even if some historical
// rows in matches_mirror don't have `regulation` populated yet.
function resolveScoringResult(match) {
  const stage = match?.stage || 'GROUP_STAGE';
  const isKnockout = stage !== 'GROUP_STAGE';
  const reg = match?.score?.regulation;
  const hasReg = reg && reg.home != null && reg.away != null;
  const wentToET = !!(match?.score?.wentToExtraTime || match?.score?.decidedByPenalties);

  if (isKnockout) {
    if (hasReg) return reg;
    if (wentToET) {
      logUnresolvedKnockoutOnce(match);
      return null; // 0 pts; do not fall back to fullTime — per the rules.
    }
    // No ET signal: regulation === fullTime by definition. Use it.
    return match?.score?.fullTime ?? null;
  }

  // Group stage: regulation is just fullTime. Prefer the explicit regulation
  // field when populated (post-migration rows), fall back to fullTime
  // otherwise (pre-migration rows still in JSONB).
  if (hasReg) return reg;
  return match?.score?.fullTime ?? null;
}

function calcPoints(pred, match) {
  const actual = resolveScoringResult(match);
  if (!actual || actual.home == null || actual.away == null) {
    return { points: 0, exact: false, correct: false };
  }

  const actualHome = actual.home;
  const actualAway = actual.away;
  const sp = stagePoints(match?.stage);

  if (pred.home === actualHome && pred.away === actualAway) {
    const totalGoals = actualHome + actualAway;
    const points = totalGoals >= HIGH_SCORING_MIN ? sp.exactHighScoring : sp.exact;
    return { points, exact: true, correct: true };
  }

  if (outcome(pred.home, pred.away) === outcome(actualHome, actualAway)) {
    return { points: sp.correct, exact: false, correct: true };
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
//   finishedMatches: [{ id, score, stage, ... }, ...]
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

// Test seam: scoring tests assert the warning fires exactly once per match
// per process. Tests reset between cases via this helper.
function _resetUnresolvedLogCache() {
  _unresolvedLogged.clear();
}

module.exports = {
  POINTS,
  STAGE_POINTS,
  stagePoints,
  resolveScoringResult,
  calcPoints,
  computeLeaderboard,
  readTournamentBonus,
  _resetUnresolvedLogCache,
};
