import { describe, it, expect } from 'vitest';

import {
  computeExactSpotlight,
  computeChaosPick,
  computeSpotlight,
  chaosScore,
} from '../api/_lib/spotlight.js';
import { calcPoints } from '../api/_lib/scoring.js';

function makeUser(id, name = `user-${id}`) {
  return { id, name };
}

function makeMatch(id, utcDate, home, away) {
  return {
    id,
    utcDate,
    stage: 'GROUP_STAGE',
    group: 'A',
    homeTeam: { id: `h-${id}`, name: 'Home', shortName: 'Home', tla: 'HOM', crest: null },
    awayTeam: { id: `a-${id}`, name: 'Away', shortName: 'Away', tla: 'AWY', crest: null },
    score: { fullTime: { home, away } },
  };
}

function pred(userId, matchId, home, away) {
  return { user_id: userId, match_id: matchId, home, away };
}

describe('computeExactSpotlight', () => {
  it('returns null primary when no exact scores exist', () => {
    const result = computeExactSpotlight({
      users: [makeUser('u1', 'Alice')],
      finishedMatches: [makeMatch('m1', '2026-06-12T18:00:00.000Z', 1, 0)],
      predictions: [pred('u1', 'm1', 2, 0)],
    });
    expect(result.primary).toBeNull();
    expect(result.history).toEqual([]);
  });

  it('ignores virtual 0-0 — only saved predictions count', () => {
    const result = computeExactSpotlight({
      users: [makeUser('u1', 'Alice'), makeUser('u2', 'Bob')],
      finishedMatches: [makeMatch('m1', '2026-06-12T18:00:00.000Z', 0, 0)],
      predictions: [pred('u1', 'm1', 0, 0)],
    });
    expect(result.primary?.name).toBe('Alice');
    expect(result.primary?.soloExact).toBe(true);
  });

  it('prefers 5-pt high-scoring exact over 3-pt exact on the same day', () => {
    const day = '2026-06-12T15:00:00.000Z';
    const result = computeExactSpotlight({
      users: [makeUser('u1', 'Alice'), makeUser('u2', 'Bob')],
      finishedMatches: [
        makeMatch('m1', day, 1, 0),
        makeMatch('m2', '2026-06-12T20:00:00.000Z', 3, 1),
      ],
      predictions: [
        pred('u1', 'm1', 1, 0),
        pred('u2', 'm2', 3, 1),
      ],
      asOf: new Date('2026-06-12T10:00:00.000Z').getTime(),
    });
    expect(result.primary?.name).toBe('Bob');
    expect(result.primary?.points).toBe(5);
    expect(result.primary?.period).toBe('today');
  });
});

describe('computeChaosPick', () => {
  it('picks the most spectacular wrong prediction', () => {
    const day = '2026-06-12T18:00:00.000Z';
    const match = makeMatch('m1', day, 0, 1);
    const result = computeChaosPick({
      users: [makeUser('u1', 'Alice'), makeUser('u2', 'Bob')],
      finishedMatches: [match],
      predictions: [
        pred('u1', 'm1', 1, 0),
        pred('u2', 'm1', 4, 3),
      ],
      asOf: new Date('2026-06-12T22:00:00.000Z').getTime(),
    });
    expect(result.primary?.name).toBe('Bob');
    expect(result.primary?.prediction).toEqual({ home: 4, away: 3 });
    expect(result.primary?.goalGap).toBe(6);
  });

  it('excludes exact scores from chaos', () => {
    const match = makeMatch('m1', '2026-06-12T18:00:00.000Z', 2, 1);
    const result = calcPoints({ home: 2, away: 1 }, match);
    expect(chaosScore(2, 1, 2, 1, result)).toBe(-1);

    const pick = computeChaosPick({
      users: [makeUser('u1', 'Alice')],
      finishedMatches: [match],
      predictions: [pred('u1', 'm1', 2, 1)],
      asOf: new Date('2026-06-12T22:00:00.000Z').getTime(),
    });
    expect(pick.primary).toBeNull();
  });
});

describe('computeSpotlight', () => {
  it('returns both exact and chaos sections', () => {
    const day = '2026-06-12T18:00:00.000Z';
    const result = computeSpotlight({
      users: [makeUser('u1', 'Alice'), makeUser('u2', 'Bob')],
      finishedMatches: [makeMatch('m1', day, 1, 2)],
      predictions: [
        pred('u1', 'm1', 1, 2),
        pred('u2', 'm1', 5, 0),
      ],
      asOf: new Date('2026-06-12T22:00:00.000Z').getTime(),
    });
    expect(result.exact.primary?.name).toBe('Alice');
    expect(result.chaos.primary?.name).toBe('Bob');
  });
});
