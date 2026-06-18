import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshLiveScores, isLiveWindow } from '../api/_lib/liveScores.js';

// Hard-lock guarantee: refreshLiveScores() reads + writes ONLY matches_mirror.
// It must NEVER touch users, predictions, prediction_edits, users.scores, etc.
// Deps are injected so the test never hits the network or Supabase.

function makeMockSupabase(existingRows) {
  const fromCalls = [];
  const upsertCalls = [];
  const supabase = {
    from: vi.fn((table) => {
      fromCalls.push(table);
      return {
        select: vi.fn(() => Promise.resolve({ data: existingRows, error: null })),
        upsert: vi.fn((rows, opts) => {
          upsertCalls.push({ table, rows, opts });
          return Promise.resolve({ data: null, error: null });
        }),
      };
    }),
  };
  return { supabase, fromCalls, upsertCalls };
}

// A live match in the mirror, ESPN codes ARG/FRA.
const liveMatch = {
  id: '5001',
  utcDate: '2026-06-18T18:00:00.000Z',
  status: 'IN_PLAY',
  homeTeam: { id: 'h', name: 'Argentina', tla: 'ARG', crest: null },
  awayTeam: { id: 'a', name: 'France', tla: 'FRA', crest: null },
  score: { home: 0, away: 0, fullTime: { home: 0, away: 0 } },
  timeElapsed: "10'",
};

const NOW = Date.parse('2026-06-18T18:30:00.000Z'); // 30 min into the match

const espnGame = {
  espnId: '999',
  homeCode: 'ARG',
  awayCode: 'FRA',
  homeScore: 2,
  awayScore: 1,
  status: 'IN_PLAY',
  timeElapsed: "67'",
};

describe('refreshLiveScores — write scope', () => {
  let supabase, fromCalls, upsertCalls;
  beforeEach(() => {
    ({ supabase, fromCalls, upsertCalls } = makeMockSupabase([
      { id: '5001', status: 'IN_PLAY', utc_date: liveMatch.utcDate, normalized: liveMatch },
    ]));
  });

  it('touches ONLY matches_mirror', async () => {
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => [espnGame],
      fetchEspnEvents: async () => [],
      fetchWc26: async () => [],
      now: NOW,
    });
    expect([...new Set(fromCalls)]).toEqual(['matches_mirror']);
  });

  it('never touches users / predictions / prediction_edits', async () => {
    await refreshLiveScores({ supabase, fetchEspn: async () => [espnGame], fetchEspnEvents: async () => [], fetchWc26: async () => [], now: NOW });
    for (const t of ['users', 'predictions', 'prediction_edits']) {
      expect(fromCalls).not.toContain(t);
    }
  });

  it('uses ESPN and writes the oriented score', async () => {
    const res = await refreshLiveScores({ supabase, fetchEspn: async () => [espnGame], fetchEspnEvents: async () => [], fetchWc26: async () => [], now: NOW });
    expect(res.source).toBe('espn');
    expect(res.updated).toBe(1);
    const row = upsertCalls[0].rows[0];
    expect(row).toMatchObject({ id: '5001', home_score: 2, away_score: 1, status: 'IN_PLAY' });
    expect(row.normalized._liveSource).toBe('espn');
  });

  it('falls back to wc26 when ESPN throws', async () => {
    const res = await refreshLiveScores({
      supabase,
      fetchEspn: async () => { throw new Error('espn 503'); },
      fetchWc26: async () => [{ ...liveMatch, status: 'IN_PLAY', score: { fullTime: { home: 3, away: 0 } } }],
      now: NOW,
    });
    expect(res.source).toBe('wc26');
    expect(res.espnError).toBe('espn 503');
    expect(upsertCalls[0].rows[0]).toMatchObject({ home_score: 3, away_score: 0 });
    expect(upsertCalls[0].rows[0].normalized._liveSource).toBe('wc26');
  });

  it('falls back per-match when ESPN omits the game', async () => {
    const res = await refreshLiveScores({
      supabase,
      fetchEspn: async () => [], // ESPN ok but doesn't list this match
      fetchWc26: async () => [{ ...liveMatch, score: { fullTime: { home: 1, away: 1 } } }],
      now: NOW,
    });
    expect(res.source).toBe('wc26');
    expect(upsertCalls[0].rows[0]).toMatchObject({ home_score: 1, away_score: 1 });
  });

  it('writes nothing when the score is unchanged', async () => {
    const res = await refreshLiveScores({
      supabase,
      fetchEspn: async () => [{ ...espnGame, homeScore: 0, awayScore: 0, timeElapsed: "10'" }],
      fetchEspnEvents: async () => [],
      fetchWc26: async () => [],
      now: NOW,
    });
    expect(res.updated).toBe(0);
    expect(upsertCalls).toHaveLength(0);
  });

  it('writes when a new card appears even with no score change', async () => {
    const res = await refreshLiveScores({
      supabase,
      fetchEspn: async () => [{ ...espnGame, homeScore: 0, awayScore: 0, timeElapsed: "10'" }],
      fetchEspnEvents: async () => [
        { id: 'card1', kind: 'yellow', team: 'France', players: ['Mbappé'], clock: "12'" },
      ],
      fetchWc26: async () => [],
      now: NOW,
    });
    expect(res.updated).toBe(1);
    const ids = upsertCalls[0].rows[0].normalized.events.map((e) => e.id);
    expect(ids).toContain('card1');
  });

  it('no-ops when nothing is live (no ESPN call)', async () => {
    const { supabase: sb } = makeMockSupabase([
      { id: '1', status: 'FINISHED', utc_date: '2026-06-10T00:00:00Z', normalized: { id: '1', status: 'FINISHED', utcDate: '2026-06-10T00:00:00Z' } },
    ]);
    const espn = vi.fn(async () => [espnGame]);
    const res = await refreshLiveScores({ supabase: sb, fetchEspn: espn, fetchWc26: async () => [], now: NOW });
    expect(res.source).toBe('none');
    expect(espn).not.toHaveBeenCalled();
  });
});

describe('isLiveWindow', () => {
  it('includes IN_PLAY / PAUSED, excludes FINISHED', () => {
    expect(isLiveWindow({ status: 'IN_PLAY' }, NOW)).toBe(true);
    expect(isLiveWindow({ status: 'PAUSED' }, NOW)).toBe(true);
    expect(isLiveWindow({ status: 'FINISHED', utcDate: liveMatch.utcDate }, NOW)).toBe(false);
  });
  it('includes SCHEDULED near kickoff, excludes far-off', () => {
    expect(isLiveWindow({ status: 'SCHEDULED', utcDate: '2026-06-18T18:20:00Z' }, NOW)).toBe(true);
    expect(isLiveWindow({ status: 'SCHEDULED', utcDate: '2026-06-19T18:00:00Z' }, NOW)).toBe(false);
  });
});
