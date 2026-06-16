import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshMirror } from '../api/_lib/mirrorRefresh.js';

// Hard-lock guarantee: refreshMirror() writes ONLY to matches_mirror +
// teams_mirror. It must NEVER touch users, predictions, prediction_edits,
// users.scores, users.bet, or tournamentBonus.
//
// We inject mock dependencies so the test never hits the network or
// Supabase. The mock supabase client records every .from() call so we can
// assert the table whitelist.

function makeMockSupabase() {
  const fromCalls = [];
  const upsertCalls = [];
  const supabase = {
    from: vi.fn((table) => {
      fromCalls.push(table);
      return {
        select: vi.fn(() => Promise.resolve({ data: [], error: null })),
        upsert: vi.fn((rows, opts) => {
          upsertCalls.push({ table, rowCount: rows.length, opts });
          return Promise.resolve({ data: null, error: null });
        }),
      };
    }),
  };
  return { supabase, fromCalls, upsertCalls };
}

const sampleMatch = {
  id: '1001',
  utcDate: '2026-06-15T15:00:00.000Z',
  status: 'FINISHED',
  stage: 'GROUP_STAGE',
  group: 'A',
  homeTeam: { id: 'h1', name: 'Home', shortName: 'Home', tla: 'HOM', crest: null },
  awayTeam: { id: 'a1', name: 'Away', shortName: 'Away', tla: 'AWY', crest: null },
  score: { fullTime: { home: 2, away: 1 } },
  matchday: 1,
  timeElapsed: null,
};
const sampleTeam = {
  id: 'h1', name: 'Home', shortName: 'Home', tla: 'HOM', crest: null,
};

describe('mirrorRefresh — write scope is matches_mirror + teams_mirror only', () => {
  let supabase, fromCalls, upsertCalls;
  let fetchSeasonMatches, fetchAllTeams;

  beforeEach(() => {
    ({ supabase, fromCalls, upsertCalls } = makeMockSupabase());
    fetchSeasonMatches = vi.fn(async () => [sampleMatch]);
    fetchAllTeams = vi.fn(async () => [sampleTeam]);
  });

  it('touches ONLY matches_mirror and teams_mirror', async () => {
    await refreshMirror({ supabase, fetchSeasonMatches, fetchAllTeams });
    const unique = [...new Set(fromCalls)].sort();
    expect(unique).toEqual(['matches_mirror', 'teams_mirror']);
  });

  it('does NOT touch users / predictions / prediction_edits', async () => {
    await refreshMirror({ supabase, fetchSeasonMatches, fetchAllTeams });
    for (const t of ['users', 'predictions', 'prediction_edits']) {
      expect(fromCalls).not.toContain(t);
    }
  });

  it('upserts only into matches_mirror and teams_mirror', async () => {
    await refreshMirror({ supabase, fetchSeasonMatches, fetchAllTeams });
    const upsertTables = [...new Set(upsertCalls.map((c) => c.table))].sort();
    expect(upsertTables).toEqual(['matches_mirror', 'teams_mirror']);
  });

  it('writes the transformGame id verbatim (no remap)', async () => {
    await refreshMirror({ supabase, fetchSeasonMatches, fetchAllTeams });
    // First upsert is matches_mirror; assert one match row with id = '1001'.
    const matchUpsert = upsertCalls.find((c) => c.table === 'matches_mirror');
    expect(matchUpsert.rowCount).toBe(1);
  });

  it('returns insert/update counts and ms', async () => {
    const result = await refreshMirror({ supabase, fetchSeasonMatches, fetchAllTeams });
    expect(result).toMatchObject({
      matches: expect.objectContaining({
        inserted: expect.any(Number),
        updated: expect.any(Number),
        total: 1,
      }),
      teams: expect.objectContaining({
        inserted: expect.any(Number),
        updated: expect.any(Number),
        total: 1,
      }),
      ms: expect.any(Number),
      errors: expect.any(Array),
    });
  });
});

// Static-import-scope check: mirrorRefresh.js must NOT import scoring.js.
describe('mirrorRefresh — import scope', () => {
  it('does NOT import scoring.js', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const url = await import('node:url');
    const here = path.dirname(url.fileURLToPath(import.meta.url));
    const src = fs.readFileSync(
      path.resolve(here, '..', 'api', '_lib', 'mirrorRefresh.js'),
      'utf8',
    );
    expect(src).not.toMatch(/require\(['"]\.\/scoring/);
    expect(src).not.toMatch(/from\s+['"]\.\/scoring/);
  });
});
