import { describe, it, expect } from 'vitest';
import { computeLeaderboard } from '../api/_lib/scoring.js';

// PARITY GUARANTEE: given identical (users, predictions, finishedMatches),
// computeLeaderboard returns identical output regardless of whether the
// matches came from the live worldcup26 path or the Supabase mirror.
//
// The mirror stores the same transformGame() output verbatim in its
// `normalized` JSONB column. So this test models the contract: any pair of
// match-arrays that are deep-equal must produce deep-equal leaderboards.

function makeMatch(id, home, away) {
  return { id, score: { fullTime: { home, away } } };
}

describe('scoring parity — leaderboard identical for live vs mirror inputs', () => {
  it('produces byte-equal leaderboards when finishedMatches are deep-equal', () => {
    const users = [
      { id: 'u1', name: 'A', bet: { winningTeam: 'Brazil' } },
      { id: 'u2', name: 'B', bet: {} },
    ];
    const predictions = [
      { user_id: 'u1', match_id: 'm1', home: 2, away: 1 },
      { user_id: 'u1', match_id: 'm2', home: 0, away: 0 },
      { user_id: 'u2', match_id: 'm1', home: 1, away: 1 },
    ];

    const liveMatches = [makeMatch('m1', 2, 1), makeMatch('m2', 0, 0)];
    // Mirror returns the same shape — `normalized` JSONB column preserves
    // the transformGame output verbatim, including the score nesting.
    const mirrorMatches = JSON.parse(JSON.stringify(liveMatches));

    const fromLive = computeLeaderboard({
      users, predictions, finishedMatches: liveMatches,
    });
    const fromMirror = computeLeaderboard({
      users, predictions, finishedMatches: mirrorMatches,
    });

    expect(fromMirror).toEqual(fromLive);
  });

  it('survives a mirror "round-trip" through JSON.stringify/parse without divergence', () => {
    const users = [{ id: 'u1', name: 'A', bet: {} }];
    const predictions = [
      { user_id: 'u1', match_id: '12345', home: 3, away: 2 },
    ];
    const liveMatches = [makeMatch('12345', 3, 2)];
    // Supabase JSONB <-> JS round-trips through JSON. Ensure shapes survive.
    const mirrorMatches = JSON.parse(JSON.stringify(liveMatches));
    expect(
      computeLeaderboard({ users, predictions, finishedMatches: mirrorMatches }),
    ).toEqual(
      computeLeaderboard({ users, predictions, finishedMatches: liveMatches }),
    );
  });
});
