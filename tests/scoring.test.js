import { describe, it, expect } from 'vitest';

import { computeLeaderboard, POINTS } from '../api/_lib/scoring.js';

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeUser(id, { name = `user-${id}`, bet = {}, scores } = {}) {
  const u = { id, name, bet };
  if (scores !== undefined) u.scores = scores;
  return u;
}

function makeMatch(id, home, away) {
  return {
    id,
    score: { fullTime: { home, away } },
  };
}

function makePrediction(userId, matchId, home, away) {
  return { user_id: userId, match_id: matchId, home, away };
}

// Builds N finished 1-0 matches and N matching 1-0 predictions for `userId`,
// so the user lands `N` exact hits worth `3 * N` per-match points.
function buildExactHitFixture(userId, hitCount, totalMatches = hitCount) {
  if (hitCount > totalMatches) {
    throw new Error('hitCount cannot exceed totalMatches');
  }
  const finishedMatches = [];
  const predictions = [];
  for (let i = 0; i < totalMatches; i += 1) {
    const matchId = i + 1;
    finishedMatches.push(makeMatch(matchId, 1, 0));
    const predHome = i < hitCount ? 1 : 9;
    const predAway = i < hitCount ? 0 : 9;
    predictions.push(makePrediction(userId, matchId, predHome, predAway));
  }
  return { finishedMatches, predictions };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('computeLeaderboard — exact-score bonus threshold', () => {
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
    'with %i exact hits → exactScoreBonus = %i (bonus never stacks)',
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
});

describe('computeLeaderboard — virtual 0-0 default prediction', () => {
  it('counts a single virtual 0-0 exact hit (no prediction row, actual 0-0)', () => {
    const userId = 'u-virtual-1';
    const users = [makeUser(userId)];
    const finishedMatches = [makeMatch(1, 0, 0)];
    const predictions = []; // no row → virtual 0-0

    const [row] = computeLeaderboard({ users, finishedMatches, predictions });

    expect(row.exactScores).toBe(1);
    expect(row.exactScoreBonus).toBe(0); // only 1 hit, no bonus yet
    expect(row.points).toBe(POINTS.EXACT_BASE); // 3 pts, total goals ≤ 4
  });

  it('three default 0-0 exact hits trigger the +3 bonus (user saved nothing)', () => {
    const userId = 'u-virtual-3';
    const users = [makeUser(userId)];
    const finishedMatches = [
      makeMatch(1, 0, 0),
      makeMatch(2, 0, 0),
      makeMatch(3, 0, 0),
    ];
    const predictions = []; // user never saved anything

    const [row] = computeLeaderboard({ users, finishedMatches, predictions });

    expect(row.exactScores).toBe(3);
    expect(row.exactScoreBonus).toBe(3);
    // 3 exact 0-0 hits × 3 pts + 3 bonus = 12, all folded into `points`.
    expect(row.points).toBe(3 * POINTS.EXACT_BASE + POINTS.EXACT_SCORE_BONUS);
  });

  it('missing prediction + non-0-0 actual is scored as default 0-0 (not exact, not correct, 0 pts)', () => {
    const userId = 'u-virtual-miss';
    const users = [makeUser(userId)];
    // Default 0-0 vs actual 2-1: outcome draw vs home win → 0 pts.
    const finishedMatches = [makeMatch(1, 2, 1)];
    const predictions = [];

    const [row] = computeLeaderboard({ users, finishedMatches, predictions });

    expect(row.exactScores).toBe(0);
    expect(row.correctResults).toBe(0);
    expect(row.exactScoreBonus).toBe(0);
    expect(row.points).toBe(0);
  });

  it('virtual 0-0 vs actual 0-1 → outcome draw vs away win → 0 pts, not exact', () => {
    const userId = 'u-virtual-away';
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches: [makeMatch(1, 0, 1)],
      predictions: [],
    });
    expect(row.exactScores).toBe(0);
    expect(row.correctResults).toBe(0);
    expect(row.points).toBe(0);
  });
});

describe('computeLeaderboard — high-scoring + correct-result paths', () => {
  it('high-scoring exact (4-3, total 7) awards EXACT_BASE + HIGH_SCORING_BONUS = 5 pts', () => {
    const userId = 'u-high';
    const [row] = computeLeaderboard({
      users: [makeUser(userId)],
      finishedMatches: [makeMatch(1, 4, 3)],
      predictions: [makePrediction(userId, 1, 4, 3)],
    });
    expect(row.exactScores).toBe(1);
    expect(row.points).toBe(POINTS.EXACT_BASE + POINTS.HIGH_SCORING_BONUS);
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
      // no row for match 3 → virtual 0-0; actual 0-1 → wrong
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
