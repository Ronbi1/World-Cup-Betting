import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshLiveScores } from '../api/_lib/liveScores.js';

// Regulation freeze rule — once a tick captures score.regulation (sum of
// halves 1+2 from ESPN linescores), later ticks must NEVER overwrite it.
// This is what guarantees that ET goals (which push fullTime up) cannot
// change the regulation-time result scoring is based on.

function makeMockSupabase(initialRows) {
  let rows = initialRows.map((r) => ({ ...r }));
  const fromCalls = [];
  const upsertCalls = [];
  const supabase = {
    from: vi.fn((table) => {
      fromCalls.push(table);
      return {
        select: vi.fn(() => Promise.resolve({ data: rows, error: null })),
        upsert: vi.fn((newRows) => {
          upsertCalls.push({ table, rows: newRows });
          // Mutate `rows` so a sequence of refresh calls observes the prior write.
          for (const nr of newRows) {
            const idx = rows.findIndex((r) => r.id === nr.id);
            if (idx >= 0) rows[idx] = { ...rows[idx], ...nr };
            else rows.push({ ...nr });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
    }),
  };
  return { supabase, fromCalls, upsertCalls, getRows: () => rows };
}

const baseMatch = {
  id: '7001',
  utcDate: '2026-07-05T18:00:00.000Z',
  status: 'IN_PLAY',
  stage: 'ROUND_OF_16',
  homeTeam: { id: 'h', name: 'Argentina', tla: 'ARG', crest: null },
  awayTeam: { id: 'a', name: 'France', tla: 'FRA', crest: null },
  score: { home: 1, away: 1, fullTime: { home: 1, away: 1 } },
  timeElapsed: "90'",
};

const NOW = Date.parse('2026-07-05T19:50:00.000Z'); // well inside the live window

describe('refreshLiveScores — regulation freeze', () => {
  let supabase, upsertCalls, getRows;
  beforeEach(() => {
    ({ supabase, upsertCalls, getRows } = makeMockSupabase([
      { id: baseMatch.id, status: 'IN_PLAY', utc_date: baseMatch.utcDate, normalized: baseMatch },
    ]));
  });

  it('first tick at end of period 2 writes regulation (1-1) and AET=false', async () => {
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => [{
        espnId: '999', homeCode: 'ARG', awayCode: 'FRA',
        homeScore: 1, awayScore: 1,
        regulationHomeScore: 1, regulationAwayScore: 1,
        wentToExtraTime: false, decidedByPenalties: false,
        status: 'IN_PLAY', timeElapsed: "90+2'",
      }],
      fetchEspnEvents: async () => [],
      fetchWc26: async () => [],
      now: NOW,
    });
    expect(upsertCalls).toHaveLength(1);
    const n = upsertCalls[0].rows[0].normalized;
    expect(n.score.regulation).toEqual({ home: 1, away: 1 });
    expect(n.score.wentToExtraTime).toBe(false);
  });

  it('subsequent ET tick: fullTime advances to 2-1 but regulation stays 1-1', async () => {
    // Tick 1: capture regulation 1-1.
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => [{
        espnId: '999', homeCode: 'ARG', awayCode: 'FRA',
        homeScore: 1, awayScore: 1,
        regulationHomeScore: 1, regulationAwayScore: 1,
        wentToExtraTime: false, decidedByPenalties: false,
        status: 'IN_PLAY', timeElapsed: "90+2'",
      }],
      fetchEspnEvents: async () => [],
      fetchWc26: async () => [],
      now: NOW,
    });
    // Tick 2: ET goal makes it 2-1; ESPN now reports the new total. Even if
    // ESPN derives regulation as 2-1 from a buggy interpretation of the
    // running total, the freeze must keep it at 1-1.
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => [{
        espnId: '999', homeCode: 'ARG', awayCode: 'FRA',
        homeScore: 2, awayScore: 1,
        regulationHomeScore: 2, regulationAwayScore: 1, // intentionally "wrong" — must be ignored
        wentToExtraTime: true, decidedByPenalties: false,
        status: 'IN_PLAY', timeElapsed: "105'",
      }],
      fetchEspnEvents: async () => [],
      fetchWc26: async () => [],
      now: NOW,
    });
    const final = getRows().find((r) => r.id === baseMatch.id).normalized;
    expect(final.score.fullTime).toEqual({ home: 2, away: 1 });
    expect(final.score.regulation).toEqual({ home: 1, away: 1 });
    expect(final.score.wentToExtraTime).toBe(true);
  });

  it('wc26 fallback never overwrites a previously-frozen regulation', async () => {
    // Tick 1 (ESPN): freeze regulation 1-1.
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => [{
        espnId: '999', homeCode: 'ARG', awayCode: 'FRA',
        homeScore: 1, awayScore: 1,
        regulationHomeScore: 1, regulationAwayScore: 1,
        wentToExtraTime: false, decidedByPenalties: false,
        status: 'IN_PLAY', timeElapsed: "90+2'",
      }],
      fetchEspnEvents: async () => [],
      fetchWc26: async () => [],
      now: NOW,
    });
    // Tick 2 (ESPN down): wc26 reports final 2-1 with no regulation field.
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => { throw new Error('espn 503'); },
      fetchWc26: async () => [{
        id: baseMatch.id, status: 'FINISHED',
        score: { fullTime: { home: 2, away: 1 } },
        timeElapsed: 'FT',
      }],
      now: NOW,
    });
    const final = getRows().find((r) => r.id === baseMatch.id).normalized;
    expect(final.score.fullTime).toEqual({ home: 2, away: 1 });
    expect(final.score.regulation).toEqual({ home: 1, away: 1 });
  });

  it('wc26-only ticks never invent regulation when none was captured', async () => {
    // Tick 1 (ESPN down): only wc26.
    await refreshLiveScores({
      supabase,
      fetchEspn: async () => { throw new Error('espn down'); },
      fetchWc26: async () => [{
        id: baseMatch.id, status: 'IN_PLAY',
        score: { fullTime: { home: 1, away: 1 } },
        timeElapsed: "90'",
      }],
      now: NOW,
    });
    const after = getRows().find((r) => r.id === baseMatch.id).normalized;
    // Source never had regulation info — must stay null / undefined,
    // NOT silently equal to fullTime.
    expect(after.score.regulation ?? null).toBeNull();
  });
});
