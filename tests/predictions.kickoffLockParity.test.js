import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hasMatchStarted } from '../api/_lib/football.js';

// CRITICAL: POST /api/predictions is the highest-risk route because the
// kickoff lock is the integrity gate that prevents post-kickoff edits.
// We assert that hasMatchStarted() returns the SAME boolean for any given
// (utcDate, status) pair regardless of whether the match came from the
// live transformGame path or from the Supabase mirror (which stores the
// same transformGame output verbatim in `normalized` JSONB).

const FIXED_NOW = new Date('2026-06-16T18:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function makeMatch({ id, utcDate, status }) {
  // The exact shape transformGame produces. The mirror stores this verbatim
  // in `normalized` and matchesRepo returns it byte-for-byte unchanged.
  return {
    id: String(id),
    utcDate,
    status,
    stage: 'GROUP_STAGE',
    group: 'A',
    homeTeam: { id: '1', name: 'Home', shortName: 'Home', tla: 'HOM', crest: null },
    awayTeam: { id: '2', name: 'Away', shortName: 'Away', tla: 'AWY', crest: null },
    score: { home: null, away: null, halfHome: null, halfAway: null, winner: null, fullTime: { home: null, away: null } },
    matchday: 1,
    timeElapsed: null,
    referees: [],
  };
}

function mirrorRoundTrip(m) {
  // Supabase JSONB <-> JS always round-trips through JSON.
  return JSON.parse(JSON.stringify(m));
}

describe('predictions kickoff-lock parity (live vs mirror)', () => {
  it('future match: allowed under both flag states', () => {
    const live = makeMatch({
      id: 'm-future',
      utcDate: '2026-06-16T20:00:00.000Z',
      status: 'SCHEDULED',
    });
    const mirror = mirrorRoundTrip(live);
    expect(hasMatchStarted(live)).toBe(false);
    expect(hasMatchStarted(mirror)).toBe(false);
    expect(hasMatchStarted(live)).toBe(hasMatchStarted(mirror));
  });

  it('started by clock (status still SCHEDULED): rejected under both', () => {
    const live = makeMatch({
      id: 'm-clock-elapsed',
      utcDate: '2026-06-16T17:59:00.000Z',
      status: 'SCHEDULED',
    });
    const mirror = mirrorRoundTrip(live);
    expect(hasMatchStarted(live)).toBe(true);
    expect(hasMatchStarted(mirror)).toBe(true);
    expect(hasMatchStarted(live)).toBe(hasMatchStarted(mirror));
  });

  it('started by status (IN_PLAY before clock): rejected under both', () => {
    const live = makeMatch({
      id: 'm-status',
      utcDate: '2026-06-16T20:00:00.000Z',
      status: 'IN_PLAY',
    });
    const mirror = mirrorRoundTrip(live);
    expect(hasMatchStarted(live)).toBe(true);
    expect(hasMatchStarted(mirror)).toBe(true);
  });

  it('PAUSED (half-time): rejected under both', () => {
    const live = makeMatch({
      id: 'm-paused',
      utcDate: '2026-06-16T17:00:00.000Z',
      status: 'PAUSED',
    });
    const mirror = mirrorRoundTrip(live);
    expect(hasMatchStarted(live)).toBe(true);
    expect(hasMatchStarted(mirror)).toBe(true);
  });

  it('FINISHED: rejected under both', () => {
    const live = makeMatch({
      id: 'm-finished',
      utcDate: '2026-06-16T15:00:00.000Z',
      status: 'FINISHED',
    });
    const mirror = mirrorRoundTrip(live);
    expect(hasMatchStarted(live)).toBe(true);
    expect(hasMatchStarted(mirror)).toBe(true);
  });

  it('exact kickoff instant: rejected under both (>= comparison)', () => {
    const live = makeMatch({
      id: 'm-exact',
      utcDate: FIXED_NOW.toISOString(),
      status: 'SCHEDULED',
    });
    const mirror = mirrorRoundTrip(live);
    expect(hasMatchStarted(live)).toBe(true);
    expect(hasMatchStarted(mirror)).toBe(true);
  });

  it('1 ms before kickoff: allowed under both', () => {
    const live = makeMatch({
      id: 'm-edge',
      utcDate: new Date(FIXED_NOW.getTime() + 1).toISOString(),
      status: 'SCHEDULED',
    });
    const mirror = mirrorRoundTrip(live);
    expect(hasMatchStarted(live)).toBe(false);
    expect(hasMatchStarted(mirror)).toBe(false);
  });
});
