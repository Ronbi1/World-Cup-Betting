import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  refreshLiveScores,
  regulationFromEvents,
} from '../api/_lib/liveScores.js';

// Secondary regulation source: when ESPN linescores never produce a numeric
// P1/P2 pair, the FINISHED-transition tick derives regulation by summing
// goal events with `period <= 2`. The primary path (linescores freeze) is
// covered by liveScores.regulationFreeze.test.js — this file is the safety
// net for the race where ESPN flips state=post before publishing periods.

describe('regulationFromEvents — unit', () => {
  it('sums goal events with period === 1 or 2, attributed by side', () => {
    expect(
      regulationFromEvents([
        { kind: 'goal', period: 1, side: 'home' },
        { kind: 'goal', period: 2, side: 'away' },
      ]),
    ).toEqual({ home: 1, away: 1 });
  });

  it('ignores goals in period 3+ (ET) and the penalty shootout', () => {
    expect(
      regulationFromEvents([
        { kind: 'goal', period: 1, side: 'home' },
        { kind: 'goal', period: 2, side: 'away' },
        { kind: 'goal', period: 3, side: 'home' }, // ET — ignored
        { kind: 'goal', period: 4, side: 'home' }, // ET — ignored
        { kind: 'goal', period: 5, side: 'home' }, // PEN — ignored
      ]),
    ).toEqual({ home: 1, away: 1 });
  });

  it('ignores non-goal events (cards, subs)', () => {
    expect(
      regulationFromEvents([
        { kind: 'yellow', period: 1, side: 'home' },
        { kind: 'red', period: 2, side: 'away' },
        { kind: 'sub', period: 2, side: 'home' },
        { kind: 'goal', period: 2, side: 'home' },
      ]),
    ).toEqual({ home: 1, away: 0 });
  });

  it('skips goals with null period or null side (defensive)', () => {
    expect(
      regulationFromEvents([
        { kind: 'goal', period: null, side: 'home' },
        { kind: 'goal', period: 1, side: null },
        { kind: 'goal', period: 1, side: 'home' },
      ]),
    ).toEqual({ home: 1, away: 0 });
  });

  it('returns {0,0} for an empty array — a valid 0-0 regulation snapshot', () => {
    expect(regulationFromEvents([])).toEqual({ home: 0, away: 0 });
  });

  it('returns null when given a non-array (defensive)', () => {
    expect(regulationFromEvents(null)).toBeNull();
    expect(regulationFromEvents(undefined)).toBeNull();
    expect(regulationFromEvents('foo')).toBeNull();
  });
});

// ─── Integration tests ──────────────────────────────────────────────────────
function makeMockSupabase(initialRows) {
  let rows = initialRows.map((r) => ({ ...r }));
  const upsertCalls = [];
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve({ data: rows, error: null })),
      upsert: vi.fn((newRows) => {
        upsertCalls.push({ rows: newRows });
        for (const nr of newRows) {
          const idx = rows.findIndex((r) => r.id === nr.id);
          if (idx >= 0) rows[idx] = { ...rows[idx], ...nr };
          else rows.push({ ...nr });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    })),
  };
  return { supabase, upsertCalls, getRows: () => rows };
}

const liveMatch = {
  id: '7777',
  utcDate: '2026-07-05T18:00:00.000Z',
  status: 'IN_PLAY',
  stage: 'ROUND_OF_16',
  homeTeam: { id: 'h', name: 'Netherlands', tla: 'NED', crest: null },
  awayTeam: { id: 'a', name: 'Morocco', tla: 'MAR', crest: null },
  score: { home: 1, away: 1, fullTime: { home: 1, away: 1 } },
  timeElapsed: "90'",
  events: [],
};

const NOW = Date.parse('2026-07-05T19:50:00.000Z');

describe('refreshLiveScores — events-derived regulation fallback', () => {
  let supabase, upsertCalls, getRows;
  beforeEach(() => {
    ({ supabase, upsertCalls, getRows } = makeMockSupabase([
      { id: liveMatch.id, status: 'IN_PLAY', utc_date: liveMatch.utcDate, normalized: liveMatch },
    ]));
  });

  it('fills regulation from events when ESPN linescores P1/P2 are null at FINISHED', async () => {
    // The race: ESPN flips state=post with linescores length > 2 (ET happened)
    // but periods 0/1 .value are null at this single tick, so
    // regulationHomeScore / regulationAwayScore both arrive null.
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => [{
        espnId: '999', homeCode: 'NED', awayCode: 'MAR',
        homeScore: 2, awayScore: 1,
        regulationHomeScore: null, regulationAwayScore: null,
        wentToExtraTime: true, decidedByPenalties: false,
        status: 'FINISHED', timeElapsed: null,
      }],
      fetchEspnEvents: async () => [
        { id: 'g1', kind: 'goal', period: 1, espnSide: 'home', clock: "12'" },
        { id: 'g2', kind: 'goal', period: 2, espnSide: 'away', clock: "78'" },
        { id: 'g3', kind: 'goal', period: 3, espnSide: 'home', clock: "102'" }, // ET goal — ignored
      ],
      fetchWc26: async () => [],
      now: NOW,
    });
    expect(upsertCalls).toHaveLength(1);
    const n = upsertCalls[0].rows[0].normalized;
    expect(n.status).toBe('FINISHED');
    expect(n.score.regulation).toEqual({ home: 1, away: 1 });
    expect(n.score.wentToExtraTime).toBe(true);
    expect(n.score.fullTime).toEqual({ home: 2, away: 1 });
  });

  it('does NOT overwrite a previously-frozen regulation', async () => {
    // Pre-existing row already has regulation 1-1 captured by an earlier tick.
    ({ supabase, upsertCalls, getRows } = makeMockSupabase([
      {
        id: liveMatch.id,
        status: 'IN_PLAY',
        utc_date: liveMatch.utcDate,
        normalized: {
          ...liveMatch,
          score: {
            ...liveMatch.score,
            regulation: { home: 1, away: 1 },
          },
        },
      },
    ]));
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => [{
        espnId: '999', homeCode: 'NED', awayCode: 'MAR',
        homeScore: 2, awayScore: 1,
        regulationHomeScore: null, regulationAwayScore: null,
        wentToExtraTime: true, decidedByPenalties: false,
        status: 'FINISHED', timeElapsed: null,
      }],
      // Events with a SECOND home goal in period 1 — if the freeze were
      // broken, regulation would jump to 2-1 here.
      fetchEspnEvents: async () => [
        { id: 'g1', kind: 'goal', period: 1, espnSide: 'home', clock: "12'" },
        { id: 'g2', kind: 'goal', period: 1, espnSide: 'home', clock: "33'" },
        { id: 'g3', kind: 'goal', period: 2, espnSide: 'away', clock: "78'" },
      ],
      fetchWc26: async () => [],
      now: NOW,
    });
    const n = getRows().find((r) => r.id === liveMatch.id).normalized;
    expect(n.score.regulation).toEqual({ home: 1, away: 1 });
  });

  it('captures 0-0 regulation when no goals before ET (empty period 1+2 goals)', async () => {
    await refreshLiveScores({
      supabase: makeMockSupabase([
        {
          id: liveMatch.id,
          status: 'IN_PLAY',
          utc_date: liveMatch.utcDate,
          normalized: {
            ...liveMatch,
            score: { home: 0, away: 0, fullTime: { home: 0, away: 0 } },
          },
        },
      ]).supabase,
      fetchEspn: async () => [{
        espnId: '999', homeCode: 'NED', awayCode: 'MAR',
        homeScore: 0, awayScore: 0,
        regulationHomeScore: null, regulationAwayScore: null,
        wentToExtraTime: true, decidedByPenalties: true,
        status: 'FINISHED', timeElapsed: null,
      }],
      // No goals at all in periods 1-2; one ET goal that is excluded.
      fetchEspnEvents: async () => [
        { id: 'pen-final', kind: 'goal', period: 5, espnSide: 'home', clock: 'PEN' },
      ],
      fetchWc26: async () => [],
      now: NOW,
    });
    // We assert via the in-memory mock — gather rows from a fresh wrapper.
    // The previous call updated the closed-over mock; build a clean one and
    // re-run to verify deterministically.
    const fresh = makeMockSupabase([
      {
        id: liveMatch.id,
        status: 'IN_PLAY',
        utc_date: liveMatch.utcDate,
        normalized: {
          ...liveMatch,
          score: { home: 0, away: 0, fullTime: { home: 0, away: 0 } },
        },
      },
    ]);
    await refreshLiveScores({
      supabase: fresh.supabase,
      fetchEspn: async () => [{
        espnId: '999', homeCode: 'NED', awayCode: 'MAR',
        homeScore: 0, awayScore: 0,
        regulationHomeScore: null, regulationAwayScore: null,
        wentToExtraTime: true, decidedByPenalties: true,
        status: 'FINISHED', timeElapsed: null,
      }],
      fetchEspnEvents: async () => [
        { id: 'pen-final', kind: 'goal', period: 5, espnSide: 'home', clock: 'PEN' },
      ],
      fetchWc26: async () => [],
      now: NOW,
    });
    const n = fresh.upsertCalls[0].rows[0].normalized;
    expect(n.score.regulation).toEqual({ home: 0, away: 0 });
  });

  it('does NOT invent regulation when the events fetch throws', async () => {
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => [{
        espnId: '999', homeCode: 'NED', awayCode: 'MAR',
        homeScore: 2, awayScore: 1,
        regulationHomeScore: null, regulationAwayScore: null,
        wentToExtraTime: true, decidedByPenalties: false,
        status: 'FINISHED', timeElapsed: null,
      }],
      fetchEspnEvents: async () => { throw new Error('summary 503'); },
      fetchWc26: async () => [],
      now: NOW,
    });
    const n = upsertCalls[0].rows[0].normalized;
    // Regulation should stay null; admin SQL is now the only recourse.
    expect(n.score.regulation ?? null).toBeNull();
    expect(n.score.wentToExtraTime).toBe(true);
    expect(n.status).toBe('FINISHED');
  });

  it('does NOT apply the fallback when there is no ET signal', async () => {
    // A knockout match that ended 1-0 in regulation (no ET) takes the
    // fullTime path in resolveScoringResult; the events fallback is
    // intentionally inert here so we don't shadow that explicit fallback.
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => [{
        espnId: '999', homeCode: 'NED', awayCode: 'MAR',
        homeScore: 1, awayScore: 0,
        regulationHomeScore: null, regulationAwayScore: null,
        wentToExtraTime: false, decidedByPenalties: false,
        status: 'FINISHED', timeElapsed: null,
      }],
      fetchEspnEvents: async () => [
        { id: 'g1', kind: 'goal', period: 1, espnSide: 'home', clock: "12'" },
      ],
      fetchWc26: async () => [],
      now: NOW,
    });
    const n = upsertCalls[0].rows[0].normalized;
    expect(n.score.regulation ?? null).toBeNull();
    expect(n.score.fullTime).toEqual({ home: 1, away: 0 });
    expect(n.score.wentToExtraTime).toBe(false);
  });
});
