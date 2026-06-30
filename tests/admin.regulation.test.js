import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setMatchRegulation } from '../api/_routes/admin.routes.js';

// Admin manual fallback for the rare case where the auto-capture path in
// liveScores.js failed to populate `matches_mirror.normalized.score.regulation`
// for a knockout match. The route is intentionally narrow:
//   * Validates home/away are non-negative integers ≤ 20.
//   * Looks up the match; rejects unknown ids.
//   * Knockout-only (stage !== 'GROUP_STAGE').
//   * Idempotency: refuses to overwrite a non-null existing regulation.

// Minimal supabase test double — implements only the call surface the
// handler uses: from(table).select(cols).eq(col, val).maybeSingle() and
// from(table).update(patch).eq(col, val).
function makeSupabase({ existing = null, readErr = null, writeErr = null } = {}) {
  let updated = null;
  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({
            data: existing,
            error: readErr,
          })),
        })),
      })),
      update: vi.fn((patch) => {
        updated = { patch };
        return {
          eq: vi.fn((col, val) => {
            updated.eqArgs = [col, val];
            return Promise.resolve({ error: writeErr });
          }),
        };
      }),
    })),
  };
  return { supabase, getUpdated: () => updated };
}

const baseMatch = {
  id: '7777',
  status: 'FINISHED',
  stage: 'ROUND_OF_16',
  normalized: {
    id: '7777',
    status: 'FINISHED',
    stage: 'ROUND_OF_16',
    homeTeam: { name: 'Netherlands' },
    awayTeam: { name: 'Morocco' },
    score: {
      home: 2, away: 1,
      fullTime: { home: 2, away: 1 },
      regulation: null,
      wentToExtraTime: true,
      decidedByPenalties: false,
    },
  },
};

describe('setMatchRegulation', () => {
  let getUpdated;
  beforeEach(() => {
    getUpdated = null;
  });

  it('rejects when id is missing', async () => {
    const { supabase } = makeSupabase();
    const out = await setMatchRegulation(supabase, { id: '', home: 1, away: 1 });
    expect(out.status).toBe(400);
    expect(out.body.error).toMatch(/missing/i);
  });

  it.each([
    ['non-integer home', { home: 1.5, away: 0 }],
    ['negative away', { home: 0, away: -1 }],
    ['string home', { home: '1', away: 0 }],
    ['over the 20-goal sanity cap', { home: 21, away: 0 }],
    ['missing away', { home: 1 }],
    ['undefined home', { home: undefined, away: 0 }],
  ])('rejects invalid body (%s)', async (_label, body) => {
    const { supabase } = makeSupabase();
    const out = await setMatchRegulation(supabase, { id: '7777', ...body });
    expect(out.status).toBe(400);
    expect(out.body.error).toMatch(/integers/i);
  });

  it('returns 404 when the match does not exist', async () => {
    const { supabase } = makeSupabase({ existing: null });
    const out = await setMatchRegulation(supabase, { id: '404', home: 1, away: 1 });
    expect(out.status).toBe(404);
  });

  it('rejects with 400 for a group-stage match', async () => {
    const groupRow = {
      ...baseMatch,
      stage: 'GROUP_STAGE',
      normalized: { ...baseMatch.normalized, stage: 'GROUP_STAGE' },
    };
    const { supabase } = makeSupabase({ existing: groupRow });
    const out = await setMatchRegulation(supabase, { id: '7777', home: 1, away: 1 });
    expect(out.status).toBe(400);
    expect(out.body.error).toMatch(/knockout/i);
  });

  it('returns 409 when regulation is already populated (idempotency guard)', async () => {
    const row = {
      ...baseMatch,
      normalized: {
        ...baseMatch.normalized,
        score: { ...baseMatch.normalized.score, regulation: { home: 1, away: 1 } },
      },
    };
    const { supabase } = makeSupabase({ existing: row });
    const out = await setMatchRegulation(supabase, { id: '7777', home: 2, away: 0 });
    expect(out.status).toBe(409);
    expect(out.body.regulation).toEqual({ home: 1, away: 1 });
  });

  it('writes the new regulation into normalized.score for a knockout row', async () => {
    let captured;
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: baseMatch, error: null })),
          })),
        })),
        update: vi.fn((patch) => {
          captured = patch;
          return { eq: vi.fn(() => Promise.resolve({ error: null })) };
        }),
      })),
    };
    const out = await setMatchRegulation(supabase, { id: '7777', home: 1, away: 1 });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({
      ok: true,
      match: { id: '7777', stage: 'ROUND_OF_16', regulation: { home: 1, away: 1 } },
    });
    expect(captured.normalized.score.regulation).toEqual({ home: 1, away: 1 });
    // Preserves all other score fields — fullTime, ET flags, etc.
    expect(captured.normalized.score.fullTime).toEqual({ home: 2, away: 1 });
    expect(captured.normalized.score.wentToExtraTime).toBe(true);
    // mirror_updated_at is bumped.
    expect(typeof captured.mirror_updated_at).toBe('string');
  });

  it('honors 0-0 as a valid regulation value', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({ data: baseMatch, error: null })),
          })),
        })),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      })),
    };
    const out = await setMatchRegulation(supabase, { id: '7777', home: 0, away: 0 });
    expect(out.status).toBe(200);
    expect(out.body.match.regulation).toEqual({ home: 0, away: 0 });
  });

  it('propagates supabase read errors', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() => Promise.resolve({
              data: null,
              error: { message: 'connection refused' },
            })),
          })),
        })),
        update: vi.fn(),
      })),
    };
    await expect(
      setMatchRegulation(supabase, { id: '7777', home: 1, away: 1 }),
    ).rejects.toMatchObject({ message: 'connection refused' });
  });
});
