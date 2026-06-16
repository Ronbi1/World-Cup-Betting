import { describe, it, expect, beforeEach } from 'vitest';
import {
  readAllMatches,
  readTodayMatches,
  readFinishedMatches,
  readTeams,
} from '../api/_lib/matchesRepo.js';

// matchesRepo returns the `normalized` JSONB column verbatim — the exact
// shape transformGame produces. We inject a mock supabase to avoid loading
// the real client (it requires env vars + network).

const sampleMatches = [
  {
    id: '1',
    utcDate: '2026-06-16T15:00:00.000Z',
    status: 'FINISHED',
    score: { fullTime: { home: 2, away: 1 } },
  },
  {
    id: '2',
    utcDate: '2026-06-16T18:00:00.000Z',
    status: 'SCHEDULED',
    score: { fullTime: { home: null, away: null } },
  },
  {
    id: '3',
    utcDate: '2026-06-17T15:00:00.000Z',
    status: 'SCHEDULED',
    score: { fullTime: { home: null, away: null } },
  },
];

const sampleTeams = [
  { id: 'a', name: 'Brazil' },
  { id: 'b', name: 'Argentina' },
];

function makeSupabase() {
  return {
    from(table) {
      if (table === 'matches_mirror') {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: sampleMatches.map((m) => ({ normalized: m, utc_date: m.utcDate })),
              error: null,
            }),
          }),
        };
      }
      if (table === 'teams_mirror') {
        return {
          select: () => ({
            order: () => Promise.resolve({
              data: sampleTeams.map((t) => ({ normalized: t })),
              error: null,
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

describe('matchesRepo — reads', () => {
  let supabase;
  beforeEach(() => { supabase = makeSupabase(); });

  it('readAllMatches returns normalized payloads verbatim', async () => {
    expect(await readAllMatches({ supabase })).toEqual(sampleMatches);
  });

  it('readFinishedMatches filters status === FINISHED', async () => {
    const finished = await readFinishedMatches({ supabase });
    expect(finished.map((m) => m.id)).toEqual(['1']);
  });

  it('readTodayMatches filters by utcDate yyyy-mm-dd', async () => {
    const today = await readTodayMatches(new Date('2026-06-16T12:00:00.000Z'), { supabase });
    expect(today.map((m) => m.id).sort()).toEqual(['1', '2']);
  });

  it('readTeams returns normalized payloads verbatim', async () => {
    expect(await readTeams({ supabase })).toEqual(sampleTeams);
  });
});
