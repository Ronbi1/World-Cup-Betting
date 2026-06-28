import { describe, it, expect } from 'vitest';

import {
  calcPoints as serverCalcPoints,
  STAGE_POINTS as serverStagePoints,
} from '../api/_lib/scoring.js';
import {
  calcMatchPoints as clientCalcPoints,
  STAGE_POINTS as clientStagePoints,
} from '../src/utils/scoring.js';

// The PlayerScoreModal renders against the client scoring mirror. If it
// drifts from the server's authoritative table, the per-match breakdown a
// user sees will diverge from the leaderboard total. These tests pin both
// modules to the same point matrix and the same regulation-time resolution.

describe('client / server scoring parity', () => {
  it('STAGE_POINTS table is identical', () => {
    expect(clientStagePoints).toEqual(serverStagePoints);
  });

  // Cover every stage + every result tier so a single divergence trips one test.
  const cases = [];
  for (const stage of Object.keys(serverStagePoints)) {
    cases.push(
      [stage, [1, 0], [1, 0], { regulation: { home: 1, away: 0 } }], // exact ≤3
      [stage, [2, 2], [2, 2], { regulation: { home: 2, away: 2 } }], // exact ≥4
      [stage, [2, 0], [1, 0], { regulation: { home: 1, away: 0 } }], // direction
      [stage, [0, 0], [1, 0], { regulation: { home: 1, away: 0 } }], // miss
    );
  }
  // Plus regulation-vs-fullTime divergence cases for knockout stages.
  cases.push(
    ['ROUND_OF_16', [1, 1], [2, 1], {
      regulation: { home: 1, away: 1 }, wentToExtraTime: true,
    }],
    ['FINAL', [0, 0], [0, 0], {
      regulation: { home: 0, away: 0 }, decidedByPenalties: true,
    }],
    ['QUARTER_FINALS', [2, 1], [3, 2], {
      regulation: { home: 2, away: 2 }, wentToExtraTime: true,
    }],
  );

  it.each(cases)('parity at %s pred %j vs actual %j', (stage, [ph, pa], [ah, aa], opts) => {
    const match = {
      id: `${stage}-${ph}-${pa}-${ah}-${aa}`,
      stage,
      score: {
        fullTime: { home: ah, away: aa },
        ...(opts.regulation !== undefined ? { regulation: opts.regulation } : {}),
        ...(opts.wentToExtraTime !== undefined ? { wentToExtraTime: opts.wentToExtraTime } : {}),
        ...(opts.decidedByPenalties !== undefined ? { decidedByPenalties: opts.decidedByPenalties } : {}),
      },
    };
    const pred = { home: ph, away: pa };

    const s = serverCalcPoints({ user_id: 'u', match_id: match.id, ...pred }, match);
    const c = clientCalcPoints(pred, match);

    expect(c.points).toBe(s.points);
    expect(c.exact).toBe(s.exact);
    expect(c.correct).toBe(s.correct);
  });
});
