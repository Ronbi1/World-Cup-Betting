import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  computeLeaderboard,
  POINTS,
  STAGE_POINTS,
  calcPoints,
  resolveScoringResult,
  _resetUnresolvedLogCache,
} from '../api/_lib/scoring.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeUser(id, { name = `user-${id}`, bet = {}, scores } = {}) {
  const u = { id, name, bet };
  if (scores !== undefined) u.scores = scores;
  return u;
}

function makeMatch(id, home, away, opts = {}) {
  const { stage, regulation, wentToExtraTime, decidedByPenalties, homeTeam, awayTeam } = opts;
  const match = {
    id,
    score: { fullTime: { home, away } },
  };
  if (stage !== undefined) match.stage = stage;
  if (regulation !== undefined) {
    match.score.regulation = regulation === null
      ? null
      : { home: regulation.home, away: regulation.away };
  }
  if (wentToExtraTime !== undefined) match.score.wentToExtraTime = wentToExtraTime;
  if (decidedByPenalties !== undefined) match.score.decidedByPenalties = decidedByPenalties;
  if (homeTeam) match.homeTeam = homeTeam;
  if (awayTeam) match.awayTeam = awayTeam;
  return match;
}

function makePrediction(userId, matchId, home, away) {
  return { user_id: userId, match_id: matchId, home, away };
}

// Builds N finished 1-0 matches and N matching 1-0 predictions for `userId`,
// so the user lands `N` exact hits worth `3 * N` per-match points (group rate).
function buildExactHitFixture(userId, hitCount, totalMatches = hitCount, opts = {}) {
  if (hitCount > totalMatches) {
    throw new Error('hitCount cannot exceed totalMatches');
  }
  const finishedMatches = [];
  const predictions = [];
  for (let i = 0; i < totalMatches; i += 1) {
    const matchId = i + 1;
    finishedMatches.push(makeMatch(matchId, 1, 0, opts));
    const predHome = i < hitCount ? 1 : 9;
    const predAway = i < hitCount ? 0 : 9;
    predictions.push(makePrediction(userId, matchId, predHome, predAway));
  }
  return { finishedMatches, predictions };
}

function buildPatternFixture(userId, pattern, opts = {}) {
  const finishedMatches = [];
  const predictions = [];
  for (let i = 0; i < pattern.length; i += 1) {
    const matchId = i + 1;
    finishedMatches.push(makeMatch(matchId, 1, 0, opts));
    if (pattern[i]) {
      predictions.push(makePrediction(userId, matchId, 1, 0));
    } else {
      predictions.push(makePrediction(userId, matchId, 9, 9));
    }
  }
  return { finishedMatches, predictions };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('computeLeaderboard — exact-score streak bonus', () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 3],
    [4, 3],
    [6, 3],
    [9, 3],
    [12, 3],
  ])(
    'with %i consecutive exact hits → exactScoreBonus = %i (bonus never stacks)',
    (hitCount, expectedBonus) => {
      const userId = 'u1';
      const users = [makeUser(userId)];
      const { finishedMatches, predictions } = buildExactHitFixture(
        userId,
        hitCount,
      );

      const [row] = computeLeaderboard({
        users,
        finishedMatches,
        predictions,
      });

      expect(row.exactScores).toBe(hitCount);
      expect(row.exactScoreBonus).toBe(expectedBonus);
      expect(row.exactScoreBonus).toBe(hitCount >= 3 ? 3 : 0);

      // Points = per-match (3 pts per 1-0 exact hit) + bonus, folded in.
      const expectedPoints = hitCount * POINTS.EXACT_BASE + expectedBonus;
      expect(row.points).toBe(expectedPoints);
    },
  );

  it('caps the bonus at POINTS.EXACT_SCORE_BONUS regardless of hit count', () => {
    const userId = 'u-overkill';
    const { finishedMatches, predictions } = buildExactHitFixture(userId, 12);
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches,
      predictions,
    });
    expect(row.exactScoreBonus).toBe(POINTS.EXACT_SCORE_BONUS);
    expect(POINTS.EXACT_SCORE_BONUS).toBe(3);
    expect(POINTS.EXACT_SCORE_BONUS_MIN).toBe(3);
  });

  it('does not award bonus for 3 total exact hits that are not consecutive', () => {
    const userId = 'u-nonconsecutive';
    const { finishedMatches, predictions } = buildPatternFixture(userId, [
      true,
      false,
      true,
      false,
      true,
    ]);
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches,
      predictions,
    });

    expect(row.exactScores).toBe(3);
    expect(row.exactScoreBonus).toBe(0);
    expect(row.points).toBe(3 * POINTS.EXACT_BASE);
  });

  it('awards bonus when the 3rd consecutive exact hit appears later in the run', () => {
    const userId = 'u-late-streak';
    const { finishedMatches, predictions } = buildPatternFixture(userId, [
      true,
      false,
      true,
      true,
      true,
    ]);
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches,
      predictions,
    });

    expect(row.exactScores).toBe(4);
    expect(row.exactScoreBonus).toBe(POINTS.EXACT_SCORE_BONUS);
    expect(row.points).toBe(4 * POINTS.EXACT_BASE + POINTS.EXACT_SCORE_BONUS);
  });

  it('resets the streak after a miss — two exact, miss, three exact still qualifies', () => {
    const userId = 'u-reset-streak';
    const { finishedMatches, predictions } = buildPatternFixture(userId, [
      true,
      true,
      false,
      true,
      true,
      true,
    ]);
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches,
      predictions,
    });

    expect(row.exactScores).toBe(5);
    expect(row.exactScoreBonus).toBe(POINTS.EXACT_SCORE_BONUS);
  });
});

describe('computeLeaderboard — missing prediction earns 0 and breaks streak', () => {
  it('missing prediction + actual 0-0 → 0 exact, 0 correct, 0 points (no virtual default)', () => {
    const userId = 'u-missing-00';
    const users = [makeUser(userId)];
    const finishedMatches = [makeMatch(1, 0, 0)];
    const predictions = []; // no row → unscored

    const [row] = computeLeaderboard({ users, finishedMatches, predictions });

    expect(row.exactScores).toBe(0);
    expect(row.correctResults).toBe(0);
    expect(row.exactScoreBonus).toBe(0);
    expect(row.points).toBe(0);
  });

  it('three missing predictions over three 0-0 finishes → no streak, no bonus', () => {
    const userId = 'u-missing-3';
    const users = [makeUser(userId)];
    const finishedMatches = [
      makeMatch(1, 0, 0),
      makeMatch(2, 0, 0),
      makeMatch(3, 0, 0),
    ];
    const predictions = []; // user never saved anything

    const [row] = computeLeaderboard({ users, finishedMatches, predictions });

    expect(row.exactScores).toBe(0);
    expect(row.exactScoreBonus).toBe(0);
    expect(row.points).toBe(0);
  });

  it('missing prediction + non-0-0 actual → 0 pts (not exact, not correct)', () => {
    const userId = 'u-missing-miss';
    const users = [makeUser(userId)];
    const finishedMatches = [makeMatch(1, 2, 1)];
    const predictions = [];

    const [row] = computeLeaderboard({ users, finishedMatches, predictions });

    expect(row.exactScores).toBe(0);
    expect(row.correctResults).toBe(0);
    expect(row.exactScoreBonus).toBe(0);
    expect(row.points).toBe(0);
  });

  it('missing prediction + actual 0-1 → 0 pts (no away-win credit, no virtual draw)', () => {
    const userId = 'u-missing-away';
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches: [makeMatch(1, 0, 1)],
      predictions: [],
    });
    expect(row.exactScores).toBe(0);
    expect(row.correctResults).toBe(0);
    expect(row.points).toBe(0);
  });

  it('missing prediction breaks the exact-score streak — exact, exact, MISSING, exact, exact → no +3', () => {
    const userId = 'u-missing-streak';
    const finishedMatches = [
      makeMatch(1, 1, 0),
      makeMatch(2, 1, 0),
      makeMatch(3, 1, 0), // no prediction for this one
      makeMatch(4, 1, 0),
      makeMatch(5, 1, 0),
    ];
    const predictions = [
      makePrediction(userId, 1, 1, 0),
      makePrediction(userId, 2, 1, 0),
      // match 3 intentionally omitted — missing prediction
      makePrediction(userId, 4, 1, 0),
      makePrediction(userId, 5, 1, 0),
    ];

    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches,
      predictions,
    });

    expect(row.exactScores).toBe(4);
    expect(row.exactScoreBonus).toBe(0); // longest run is 2 — missing broke the streak
    expect(row.points).toBe(4 * POINTS.EXACT_BASE);
  });
});

describe('computeLeaderboard — high-scoring + correct-result paths', () => {
  it('HIGH_SCORING_MIN is 4 — the threshold is goals >= 4, not >= 5', () => {
    expect(POINTS.HIGH_SCORING_MIN).toBe(4);
  });

  it('high-scoring exact (4-3, total 7) — well above threshold, awards EXACT_BASE + HIGH_SCORING_BONUS = 5 pts', () => {
    const userId = 'u-high';
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches: [makeMatch(1, 4, 3)],
      predictions: [makePrediction(userId, 1, 4, 3)],
    });
    expect(row.exactScores).toBe(1);
    expect(row.points).toBe(POINTS.EXACT_BASE + POINTS.HIGH_SCORING_BONUS);
    expect(row.points).toBe(5);
  });

  it('2-2 exact (total 4) — AT the threshold, awards high-scoring 5 pts', () => {
    const userId = 'u-2-2';
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches: [makeMatch(1, 2, 2)],
      predictions: [makePrediction(userId, 1, 2, 2)],
    });
    expect(row.exactScores).toBe(1);
    expect(row.points).toBe(5);
    expect(row.points).toBe(POINTS.EXACT_BASE + POINTS.HIGH_SCORING_BONUS);
  });

  it('3-1 exact (total 4, asymmetric) — AT the threshold, awards high-scoring 5 pts', () => {
    const userId = 'u-3-1';
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches: [makeMatch(1, 3, 1)],
      predictions: [makePrediction(userId, 1, 3, 1)],
    });
    expect(row.exactScores).toBe(1);
    expect(row.points).toBe(5);
  });

  it('2-1 exact (total 3) — JUST BELOW the threshold, awards normal exact 3 pts', () => {
    const userId = 'u-2-1';
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches: [makeMatch(1, 2, 1)],
      predictions: [makePrediction(userId, 1, 2, 1)],
    });
    expect(row.exactScores).toBe(1);
    expect(row.points).toBe(3);
    expect(row.points).toBe(POINTS.EXACT_BASE);
  });

  it('correct-result-only (predict 2-1, actual 1-0) awards 1 pt, no exact, correct flag set', () => {
    const userId = 'u-correct';
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches: [makeMatch(1, 1, 0)],
      predictions: [makePrediction(userId, 1, 2, 1)],
    });
    expect(row.exactScores).toBe(0);
    expect(row.correctResults).toBe(1);
    expect(row.points).toBe(POINTS.CORRECT_RESULT);
    expect(row.exactScoreBonus).toBe(0);
  });

  it('mixed: one exact low + one exact high + one wrong → correct sums', () => {
    const userId = 'u-mix';
    const finishedMatches = [
      makeMatch(1, 1, 0), // exact low
      makeMatch(2, 4, 3), // exact high
      makeMatch(3, 0, 1), // wrong (predicted draw 0-0)
    ];
    const predictions = [
      makePrediction(userId, 1, 1, 0),
      makePrediction(userId, 2, 4, 3),
      // no row for match 3 → missing prediction → 0 pts (also breaks streak)
    ];

    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches,
      predictions,
    });

    expect(row.exactScores).toBe(2);
    expect(row.correctResults).toBe(2);
    expect(row.exactScoreBonus).toBe(0); // only 2 hits
    expect(row.points).toBe(
      POINTS.EXACT_BASE + (POINTS.EXACT_BASE + POINTS.HIGH_SCORING_BONUS),
    );
  });
});

describe('computeLeaderboard — tournament bonus coexists with exactScoreBonus', () => {
  it('tournament bonus point values are 15 each (winner, top scorer, top assist)', () => {
    expect(POINTS.TOURNAMENT_WINNER).toBe(15);
    expect(POINTS.TOP_SCORER).toBe(15);
    expect(POINTS.TOP_ASSIST).toBe(15);
  });

  it('Top Scorer override awards exactly 15 pts (no winner, no top assist)', () => {
    const userId = 'u-ts-15';
    const users = [makeUser(userId, { bet: { topScorer: 'Messi' } })];
    const [row] = computeLeaderboard({
      users,
      finishedMatches: [],
      predictions: [],
      tournamentOverrides: { topScorer: 'Messi' },
    });
    expect(row.points).toBe(15);
    expect(row.points).toBe(POINTS.TOP_SCORER);
  });

  it('Top Assist override awards exactly 15 pts (no winner, no top scorer)', () => {
    const userId = 'u-ta-15';
    const users = [makeUser(userId, { bet: { topAssist: 'De Bruyne' } })];
    const [row] = computeLeaderboard({
      users,
      finishedMatches: [],
      predictions: [],
      tournamentOverrides: { topAssist: 'De Bruyne' },
    });
    expect(row.points).toBe(15);
    expect(row.points).toBe(POINTS.TOP_ASSIST);
  });

  it('3 exact hits + correct tournament winner pick → both bonuses fold into points', () => {
    const userId = 'u-coexist';
    const { finishedMatches, predictions } = buildExactHitFixture(userId, 3);
    const users = [
      makeUser(userId, { bet: { winningTeam: 'Argentina' } }),
    ];

    const [row] = computeLeaderboard({
      users,
      finishedMatches,
      predictions,
      tournamentOverrides: { winner: 'Argentina' },
    });

    expect(row.exactScores).toBe(3);
    expect(row.exactScoreBonus).toBe(3);
    // 3 exact 1-0 hits × 3 + exact-score bonus + tournament-winner bonus.
    expect(row.points).toBe(
      3 * POINTS.EXACT_BASE +
        POINTS.EXACT_SCORE_BONUS +
        POINTS.TOURNAMENT_WINNER,
    );
  });

  it('tournamentOverrides wins over persisted users.scores.tournamentBonus', () => {
    const userId = 'u-override';
    const users = [
      makeUser(userId, {
        bet: { winningTeam: 'Argentina' },
        scores: { tournamentBonus: { winner: 'Brazil' } },
      }),
    ];
    // No finished matches — isolating the tournament bonus path.
    const [row] = computeLeaderboard({
      users,
      finishedMatches: [],
      predictions: [],
      tournamentOverrides: { winner: 'Argentina' },
    });

    expect(row.points).toBe(POINTS.TOURNAMENT_WINNER);
  });

  it('persisted tournamentBonus is used when no override is passed', () => {
    const userId = 'u-persist';
    const users = [
      makeUser(userId, {
        bet: { topScorer: 'Messi', topAssist: 'De Bruyne' },
        scores: {
          tournamentBonus: { topScorer: 'Messi', topAssist: 'De Bruyne' },
        },
      }),
    ];
    const [row] = computeLeaderboard({
      users,
      finishedMatches: [],
      predictions: [],
    });
    expect(row.points).toBe(POINTS.TOP_SCORER + POINTS.TOP_ASSIST);
  });

  it('case-insensitive + whitespace-trimmed winner match', () => {
    const userId = 'u-norm';
    const users = [
      makeUser(userId, { bet: { winningTeam: '  argentina ' } }),
    ];
    const [row] = computeLeaderboard({
      users,
      finishedMatches: [],
      predictions: [],
      tournamentOverrides: { winner: 'ARGENTINA' },
    });
    expect(row.points).toBe(POINTS.TOURNAMENT_WINNER);
  });

  it('wrong tournament-winner pick → no tournament points', () => {
    const userId = 'u-wrong-winner';
    const users = [
      makeUser(userId, { bet: { winningTeam: 'France' } }),
    ];
    const [row] = computeLeaderboard({
      users,
      finishedMatches: [],
      predictions: [],
      tournamentOverrides: { winner: 'Argentina' },
    });
    expect(row.points).toBe(0);
  });
});

describe('computeLeaderboard — input guards', () => {
  it('returns [] when all three arrays are empty', () => {
    expect(
      computeLeaderboard({
        users: [],
        finishedMatches: [],
        predictions: [],
      }),
    ).toEqual([]);
  });

  it('returns [] when users is empty even if matches/predictions are not', () => {
    expect(
      computeLeaderboard({
        users: [],
        finishedMatches: [makeMatch(1, 0, 0)],
        predictions: [makePrediction('ghost', 1, 0, 0)],
      }),
    ).toEqual([]);
  });

  it('does not throw when users / finishedMatches / predictions are null or undefined', () => {
    expect(() =>
      computeLeaderboard({
        users: null,
        finishedMatches: null,
        predictions: null,
      }),
    ).not.toThrow();
    expect(() =>
      computeLeaderboard({
        users: undefined,
        finishedMatches: undefined,
        predictions: undefined,
      }),
    ).not.toThrow();

    expect(
      computeLeaderboard({
        users: null,
        finishedMatches: null,
        predictions: null,
      }),
    ).toEqual([]);
  });

  it('produces one row per user, in input order', () => {
    const users = [
      makeUser('a'),
      makeUser('b'),
      makeUser('c'),
    ];
    const rows = computeLeaderboard({
      users,
      finishedMatches: [],
      predictions: [],
    });
    expect(rows.map((r) => r.userId)).toEqual(['a', 'b', 'c']);
    for (const r of rows) {
      expect(r.points).toBe(0);
      expect(r.exactScores).toBe(0);
      expect(r.correctResults).toBe(0);
      expect(r.exactScoreBonus).toBe(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage point matrix — knockout stages have escalating point values.
// ─────────────────────────────────────────────────────────────────────────────

describe('STAGE_POINTS table — values match the published matrix', () => {
  it.each([
    ['GROUP_STAGE',    1, 3,  5],
    ['ROUND_OF_32',    2, 4,  6],
    ['ROUND_OF_16',    2, 5,  7],
    ['QUARTER_FINALS', 3, 7,  9],
    ['SEMI_FINALS',    4, 9,  11],
    ['THIRD_PLACE',    4, 9,  11],
    ['FINAL',          5, 12, 15],
  ])('%s pays direction=%i exact=%i exactHighScoring=%i', (stage, correct, exact, hi) => {
    expect(STAGE_POINTS[stage]).toEqual({ correct, exact, exactHighScoring: hi });
  });

  it('THIRD_PLACE matches SEMI_FINALS exactly', () => {
    expect(STAGE_POINTS.THIRD_PLACE).toEqual(STAGE_POINTS.SEMI_FINALS);
  });
});

describe('calcPoints — per-stage exact / direction / high-scoring', () => {
  // Each row: [stage, pred, actual, expectedPoints, exactFlag, correctFlag]
  it.each([
    // Group stage (regulation === fullTime by definition).
    ['GROUP_STAGE',    [1, 0], [1, 0], 3,  true,  true],   // exact ≤3
    ['GROUP_STAGE',    [2, 2], [2, 2], 5,  true,  true],   // exact ≥4
    ['GROUP_STAGE',    [2, 0], [1, 0], 1,  false, true],   // direction only
    // R32.
    ['ROUND_OF_32',    [1, 0], [1, 0], 4,  true,  true],
    ['ROUND_OF_32',    [2, 2], [2, 2], 6,  true,  true],
    ['ROUND_OF_32',    [2, 0], [1, 0], 2,  false, true],
    // R16.
    ['ROUND_OF_16',    [1, 0], [1, 0], 5,  true,  true],
    ['ROUND_OF_16',    [3, 1], [3, 1], 7,  true,  true],
    ['ROUND_OF_16',    [2, 0], [1, 0], 2,  false, true],
    // QF.
    ['QUARTER_FINALS', [1, 0], [1, 0], 7,  true,  true],
    ['QUARTER_FINALS', [2, 2], [2, 2], 9,  true,  true],
    ['QUARTER_FINALS', [2, 0], [1, 0], 3,  false, true],
    // SF.
    ['SEMI_FINALS',    [1, 0], [1, 0], 9,  true,  true],
    ['SEMI_FINALS',    [2, 2], [2, 2], 11, true,  true],
    ['SEMI_FINALS',    [2, 0], [1, 0], 4,  false, true],
    // Third place — same as semi.
    ['THIRD_PLACE',    [1, 0], [1, 0], 9,  true,  true],
    ['THIRD_PLACE',    [4, 0], [4, 0], 11, true,  true],
    ['THIRD_PLACE',    [2, 0], [1, 0], 4,  false, true],
    // Final.
    ['FINAL',          [1, 0], [1, 0], 12, true,  true],
    ['FINAL',          [2, 2], [2, 2], 15, true,  true],
    ['FINAL',          [2, 0], [1, 0], 5,  false, true],
  ])('%s pred %j actual %j → %i pts (exact=%s correct=%s)',
    (stage, [ph, pa], [ah, aa], expectedPoints, expectedExact, expectedCorrect) => {
      // For knockout stages the engine reads `regulation`; group stage falls
      // back to fullTime. Set regulation explicitly for parity across all stages.
      const m = makeMatch(1, ah, aa, { stage, regulation: { home: ah, away: aa } });
      const r = calcPoints(makePrediction('u', 1, ph, pa), m);
      expect(r.points).toBe(expectedPoints);
      expect(r.exact).toBe(expectedExact);
      expect(r.correct).toBe(expectedCorrect);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Draw direction edge cases — predicted-vs-actual draws are direction-only.
// ─────────────────────────────────────────────────────────────────────────────

describe('calcPoints — draw direction', () => {
  it('predict 1-1, regulation 2-2 (knockout) → direction only (not exact)', () => {
    const m = makeMatch(1, 2, 2, { stage: 'ROUND_OF_16', regulation: { home: 2, away: 2 } });
    const r = calcPoints(makePrediction('u', 1, 1, 1), m);
    expect(r).toEqual({ points: STAGE_POINTS.ROUND_OF_16.correct, exact: false, correct: true });
  });

  it('predict 0-0, regulation 1-1 (knockout) → direction only', () => {
    const m = makeMatch(1, 1, 1, { stage: 'QUARTER_FINALS', regulation: { home: 1, away: 1 } });
    const r = calcPoints(makePrediction('u', 1, 0, 0), m);
    expect(r).toEqual({ points: STAGE_POINTS.QUARTER_FINALS.correct, exact: false, correct: true });
  });

  it('predict 1-1, regulation 1-1 → exact', () => {
    const m = makeMatch(1, 1, 1, { stage: 'ROUND_OF_16', regulation: { home: 1, away: 1 } });
    const r = calcPoints(makePrediction('u', 1, 1, 1), m);
    expect(r).toEqual({ points: STAGE_POINTS.ROUND_OF_16.exact, exact: true, correct: true });
  });

  it('predict home win, regulation draw → 0', () => {
    const m = makeMatch(1, 1, 1, { stage: 'FINAL', regulation: { home: 1, away: 1 } });
    expect(calcPoints(makePrediction('u', 1, 2, 0), m).points).toBe(0);
  });

  it('predict draw, regulation away win → 0', () => {
    const m = makeMatch(1, 0, 2, { stage: 'SEMI_FINALS', regulation: { home: 0, away: 2 } });
    expect(calcPoints(makePrediction('u', 1, 1, 1), m).points).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// High-scoring threshold — total goals ≥ 4 promotes exact to the high tier.
// ─────────────────────────────────────────────────────────────────────────────

describe('calcPoints — high-scoring threshold (=4 total goals)', () => {
  it.each([
    [[2, 1], 3, 'GROUP_STAGE',    3,  'just below threshold'],
    [[1, 1], 2, 'ROUND_OF_32',    4,  'far below'],
    [[2, 2], 4, 'ROUND_OF_32',    6,  'at threshold'],
    [[4, 0], 4, 'ROUND_OF_16',    7,  'at threshold, asymmetric'],
    [[3, 1], 4, 'QUARTER_FINALS', 9,  'at threshold, asymmetric'],
    [[4, 3], 7, 'FINAL',          15, 'well above threshold'],
  ])('pred %j (total %i) at %s → %i pts (%s)',
    ([ph, pa], _total, stage, expected) => {
      const m = makeMatch(1, ph, pa, { stage, regulation: { home: ph, away: pa } });
      expect(calcPoints(makePrediction('u', 1, ph, pa), m).points).toBe(expected);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Regulation-time enforcement — ET/penalties must never affect scoring.
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveScoringResult / calcPoints — knockout regulation-time rule', () => {
  beforeEach(() => {
    _resetUnresolvedLogCache();
  });

  it('regulation 1-1, fullTime 2-1, wentToExtraTime: pred 1-1 scores exact at 1-1', () => {
    const m = makeMatch(1, 2, 1, {
      stage: 'ROUND_OF_32',
      regulation: { home: 1, away: 1 },
      wentToExtraTime: true,
    });
    expect(resolveScoringResult(m)).toEqual({ home: 1, away: 1 });
    const r = calcPoints(makePrediction('u', 1, 1, 1), m);
    expect(r).toEqual({ points: STAGE_POINTS.ROUND_OF_32.exact, exact: true, correct: true });
  });

  it('regulation 0-0, fullTime 0-0, decidedByPenalties: pred 0-0 scores exact at 0-0', () => {
    const m = makeMatch(1, 0, 0, {
      stage: 'QUARTER_FINALS',
      regulation: { home: 0, away: 0 },
      decidedByPenalties: true,
    });
    const r = calcPoints(makePrediction('u', 1, 0, 0), m);
    expect(r.exact).toBe(true);
    expect(r.points).toBe(STAGE_POINTS.QUARTER_FINALS.exact);
  });

  it('regulation 2-2, fullTime 3-2, wentToExtraTime: pred 2-2 scores at 2-2; pred 3-2 scores 0', () => {
    const m = makeMatch(1, 3, 2, {
      stage: 'SEMI_FINALS',
      regulation: { home: 2, away: 2 },
      wentToExtraTime: true,
    });
    // 2-2 is 4 total goals → high-scoring exact tier at SEMI_FINALS = 11.
    expect(calcPoints(makePrediction('u', 1, 2, 2), m).points)
      .toBe(STAGE_POINTS.SEMI_FINALS.exactHighScoring);
    // 3-2 prediction matches the displayed fullTime but NOT the regulation.
    // It's an away/home outcome miss (regulation was a 2-2 draw), so 0 pts.
    expect(calcPoints(makePrediction('u', 1, 3, 2), m).points).toBe(0);
  });

  it('knockout, regulation missing + wentToExtraTime: returns null, logs once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = makeMatch(1, 2, 1, {
      stage: 'ROUND_OF_16',
      regulation: null,
      wentToExtraTime: true,
      homeTeam: { name: 'Brazil' },
      awayTeam: { name: 'Argentina' },
    });
    expect(resolveScoringResult(m)).toBeNull();
    const r = calcPoints(makePrediction('u', 1, 2, 1), m);
    expect(r).toEqual({ points: 0, exact: false, correct: false });
    expect(warn).toHaveBeenCalledTimes(1);
    const payload = warn.mock.calls[0][1];
    expect(payload).toMatchObject({
      matchId: 1,
      stage: 'ROUND_OF_16',
      homeTeam: 'Brazil',
      awayTeam: 'Argentina',
      fullTime: { home: 2, away: 1 },
      wentToExtraTime: true,
    });
    warn.mockRestore();
  });

  it('warning is logged exactly once per match per process (dedupe)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = makeMatch('dedupe-1', 2, 1, {
      stage: 'ROUND_OF_16',
      regulation: null,
      wentToExtraTime: true,
    });
    resolveScoringResult(m);
    resolveScoringResult(m);
    resolveScoringResult(m);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('knockout, regulation missing + did NOT go to ET → falls back to fullTime, no warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = makeMatch(1, 1, 0, {
      stage: 'ROUND_OF_32',
      // No regulation field, no ET flag — typical "match finished in 90'"
      // shape if the live tick missed populating regulation.
    });
    expect(resolveScoringResult(m)).toEqual({ home: 1, away: 0 });
    const r = calcPoints(makePrediction('u', 1, 1, 0), m);
    expect(r.points).toBe(STAGE_POINTS.ROUND_OF_32.exact);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('unresolved knockout match does NOT credit the exact-score streak', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const userId = 'u-unresolved-streak';
    // Three matches: exact, UNRESOLVED, exact. Without the unresolved guard
    // this would look like 3 consecutive exacts and award +3.
    const finishedMatches = [
      makeMatch('a', 1, 0, { stage: 'ROUND_OF_32', regulation: { home: 1, away: 0 } }),
      makeMatch('b', 2, 1, {
        stage: 'ROUND_OF_32', regulation: null, wentToExtraTime: true,
      }),
      makeMatch('c', 1, 0, { stage: 'ROUND_OF_32', regulation: { home: 1, away: 0 } }),
    ];
    const predictions = [
      makePrediction(userId, 'a', 1, 0),
      makePrediction(userId, 'b', 1, 1), // wouldn't have matched regulation anyway
      makePrediction(userId, 'c', 1, 0),
    ];
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches,
      predictions,
    });
    expect(row.exactScores).toBe(2);
    expect(row.exactScoreBonus).toBe(0);
    warn.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Streak bonus interaction with knockout / unresolved matches.
// ─────────────────────────────────────────────────────────────────────────────

describe('computeLeaderboard — streak bonus across stages', () => {
  it('streak can chain group → knockout matches', () => {
    const userId = 'u-cross-stage';
    const finishedMatches = [
      makeMatch(1, 1, 0, { stage: 'GROUP_STAGE' }),
      makeMatch(2, 1, 0, { stage: 'GROUP_STAGE' }),
      makeMatch(3, 1, 0, { stage: 'ROUND_OF_32', regulation: { home: 1, away: 0 } }),
    ];
    const predictions = [
      makePrediction(userId, 1, 1, 0),
      makePrediction(userId, 2, 1, 0),
      makePrediction(userId, 3, 1, 0),
    ];
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches,
      predictions,
    });
    // 3 + 3 + 4 (R32 exact ≤3) + 3 streak bonus = 13.
    expect(row.exactScores).toBe(3);
    expect(row.exactScoreBonus).toBe(3);
    expect(row.points).toBe(
      STAGE_POINTS.GROUP_STAGE.exact * 2 + STAGE_POINTS.ROUND_OF_32.exact + POINTS.EXACT_SCORE_BONUS,
    );
  });

  it('streak bonus value is unchanged at +3', () => {
    expect(POINTS.EXACT_SCORE_BONUS).toBe(3);
    expect(POINTS.EXACT_SCORE_BONUS_MIN).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defensive — must not throw on unknown stage / missing score / missing pred.
// ─────────────────────────────────────────────────────────────────────────────

describe('calcPoints — defensive paths', () => {
  it('unknown stage falls back to GROUP_STAGE rates (no throw)', () => {
    const m = makeMatch(1, 1, 0, { stage: 'NOT_A_REAL_STAGE' });
    const r = calcPoints(makePrediction('u', 1, 1, 0), m);
    expect(r.points).toBe(STAGE_POINTS.GROUP_STAGE.exact);
  });

  it('missing score returns 0 pts (no throw)', () => {
    expect(calcPoints(makePrediction('u', 1, 1, 0), { id: 1 }))
      .toEqual({ points: 0, exact: false, correct: false });
  });

  it('match status not finished (score.fullTime.home null) → 0 pts', () => {
    const m = { id: 1, score: { fullTime: { home: null, away: null } } };
    expect(calcPoints(makePrediction('u', 1, 1, 0), m).points).toBe(0);
  });
});
