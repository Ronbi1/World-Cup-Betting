import { describe, it, expect } from 'vitest';

import {
  getEstimatedMatchEnd,
  getMatchesInNextHours,
  getRecentlyFinishedMatches,
} from '../src/utils/matchTime.js';
import { MATCH_STATUS } from '../src/utils/constants.js';

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

function makeMatch({ id, status, utcDate, endedAt, finishedAt } = {}) {
  return {
    id,
    status,
    utcDate,
    endedAt,
    finishedAt,
    homeTeam: { id: 'h', name: 'H', shortName: 'H', tla: 'HHH', crest: null },
    awayTeam: { id: 'a', name: 'A', shortName: 'A', tla: 'AAA', crest: null },
    score: { home: null, away: null },
  };
}

describe('getEstimatedMatchEnd', () => {
  it('uses match.endedAt when present', () => {
    const end = '2026-06-26T20:55:00.000Z';
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T19:00:00.000Z',
      endedAt: end,
    });
    expect(getEstimatedMatchEnd(m).toISOString()).toBe(end);
  });

  it('falls back to match.finishedAt', () => {
    const end = '2026-06-26T20:50:00.000Z';
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T19:00:00.000Z',
      finishedAt: end,
    });
    expect(getEstimatedMatchEnd(m).toISOString()).toBe(end);
  });

  it('estimates kickoff + 3h when no real timestamp is provided', () => {
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T19:00:00.000Z',
    });
    expect(getEstimatedMatchEnd(m).toISOString()).toBe('2026-06-26T22:00:00.000Z');
  });

  it('returns null for empty / malformed input', () => {
    expect(getEstimatedMatchEnd(null)).toBeNull();
    expect(getEstimatedMatchEnd({})).toBeNull();
    expect(getEstimatedMatchEnd({ utcDate: 'not-a-date' })).toBeNull();
  });
});

describe('getMatchesInNextHours', () => {
  const now = new Date('2026-06-26T16:00:00.000Z').getTime(); // 19:00 Israel

  it('includes a SCHEDULED match starting inside the window', () => {
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.SCHEDULED,
      utcDate: '2026-06-26T21:00:00.000Z', // +5 h
    });
    expect(getMatchesInNextHours([m], 15, now)).toHaveLength(1);
  });

  it('excludes a SCHEDULED match beyond the window', () => {
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.SCHEDULED,
      utcDate: '2026-06-27T12:00:00.000Z', // +20 h
    });
    expect(getMatchesInNextHours([m], 15, now)).toHaveLength(0);
  });

  it('excludes a SCHEDULED match whose kickoff is already past', () => {
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.SCHEDULED,
      utcDate: '2026-06-26T15:00:00.000Z', // 1 h ago
    });
    expect(getMatchesInNextHours([m], 15, now)).toHaveLength(0);
  });

  it('always includes an IN_PLAY match regardless of kickoff', () => {
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.IN_PLAY,
      utcDate: '2026-06-26T15:00:00.000Z',
    });
    expect(getMatchesInNextHours([m], 15, now)).toHaveLength(1);
  });

  it('always includes a PAUSED (half-time) match', () => {
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.PAUSED,
      utcDate: '2026-06-26T15:30:00.000Z',
    });
    expect(getMatchesInNextHours([m], 15, now)).toHaveLength(1);
  });

  it('excludes FINISHED matches', () => {
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T15:30:00.000Z',
    });
    expect(getMatchesInNextHours([m], 15, now)).toHaveLength(0);
  });

  it('includes a kickoff that crosses midnight UTC', () => {
    // now = 22:00 UTC on day N, match at 02:00 UTC on day N+1 (4 h ahead).
    const lateEvening = new Date('2026-06-26T22:00:00.000Z').getTime();
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.SCHEDULED,
      utcDate: '2026-06-27T02:00:00.000Z',
    });
    expect(getMatchesInNextHours([m], 15, lateEvening)).toHaveLength(1);
  });

  it('sorts results by kickoff ascending', () => {
    const later = makeMatch({
      id: 'later',
      status: MATCH_STATUS.SCHEDULED,
      utcDate: '2026-06-27T05:00:00.000Z',
    });
    const sooner = makeMatch({
      id: 'sooner',
      status: MATCH_STATUS.SCHEDULED,
      utcDate: '2026-06-26T20:00:00.000Z',
    });
    const result = getMatchesInNextHours([later, sooner], 15, now);
    expect(result.map((m) => m.id)).toEqual(['sooner', 'later']);
  });

  it('handles empty / nullish inputs', () => {
    expect(getMatchesInNextHours([], 15, now)).toEqual([]);
    expect(getMatchesInNextHours(null, 15, now)).toEqual([]);
  });
});

describe('getRecentlyFinishedMatches', () => {
  it('keeps a FINISHED match whose estimated end is still in the future (lenient)', () => {
    // Kickoff 1 h ago → estimate places end 2 h *after* now. We don't yank a
    // FINISHED-flagged match just because the estimate hasn't elapsed.
    const now = new Date('2026-06-26T20:00:00.000Z').getTime();
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T19:00:00.000Z',
    });
    expect(getRecentlyFinishedMatches([m], now)).toHaveLength(1);
  });

  it('keeps a FINISHED match that ended ~30 min ago', () => {
    const now = new Date('2026-06-26T22:30:00.000Z').getTime();
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T19:00:00.000Z', // end estimate = 22:00 UTC
    });
    expect(getRecentlyFinishedMatches([m], now)).toHaveLength(1);
  });

  it('hides a FINISHED match past the 1-hour cutoff (non-morning end)', () => {
    const now = new Date('2026-06-27T00:30:00.000Z').getTime();
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T19:00:00.000Z', // end estimate = 22:00 UTC = 01:00 IL
    });
    expect(getRecentlyFinishedMatches([m], now)).toHaveLength(0);
  });

  it('prefers a real endedAt timestamp over the kickoff estimate', () => {
    const now = new Date('2026-06-26T19:30:00.000Z').getTime();
    // Kickoff ~3.5 h ago → estimate end at 19:00 (still inside 1 h). But
    // real endedAt 90 min ago means we're well past the cutoff.
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T16:00:00.000Z',
      endedAt: '2026-06-26T18:00:00.000Z',
    });
    expect(getRecentlyFinishedMatches([m], now)).toHaveLength(0);
  });

  it('keeps a morning-finished match until 19:00 Israel time same day', () => {
    // Match end = 2026-06-26 08:00 Israel (= 05:00 UTC, IL is UTC+3 in June).
    // Now = 14:00 IL same day → still visible.
    const end = '2026-06-26T05:00:00.000Z';
    const now = new Date('2026-06-26T11:00:00.000Z').getTime();
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T02:00:00.000Z',
      endedAt: end,
    });
    expect(getRecentlyFinishedMatches([m], now)).toHaveLength(1);
  });

  it('hides the same morning-finished match after 19:00 Israel time', () => {
    const end = '2026-06-26T05:00:00.000Z'; // 08:00 IL
    const now = new Date('2026-06-26T17:00:00.000Z').getTime(); // 20:00 IL
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T02:00:00.000Z',
      endedAt: end,
    });
    expect(getRecentlyFinishedMatches([m], now)).toHaveLength(0);
  });

  it('does not apply the morning rule to an end at 11:00 Israel time', () => {
    // End = 11:00 IL = 08:00 UTC (just past the morning window). Normal
    // 1-hour rule applies → still visible 30 min later, hidden 90 min later.
    const end = '2026-06-26T08:00:00.000Z';
    const m = makeMatch({
      id: '1',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T05:00:00.000Z',
      endedAt: end,
    });
    const thirtyMinAfter = new Date('2026-06-26T08:30:00.000Z').getTime();
    const ninetyMinAfter = new Date('2026-06-26T09:30:00.000Z').getTime();
    expect(getRecentlyFinishedMatches([m], thirtyMinAfter)).toHaveLength(1);
    expect(getRecentlyFinishedMatches([m], ninetyMinAfter)).toHaveLength(0);
  });

  it('excludes non-FINISHED matches regardless of timing', () => {
    const now = new Date('2026-06-26T20:00:00.000Z').getTime();
    const live = makeMatch({
      id: 'live',
      status: MATCH_STATUS.IN_PLAY,
      utcDate: '2026-06-26T19:00:00.000Z',
    });
    const scheduled = makeMatch({
      id: 'sch',
      status: MATCH_STATUS.SCHEDULED,
      utcDate: '2026-06-26T19:30:00.000Z',
    });
    expect(getRecentlyFinishedMatches([live, scheduled], now)).toHaveLength(0);
  });

  it('sorts visible matches by end time descending (most recent first)', () => {
    const now = new Date('2026-06-26T22:30:00.000Z').getTime();
    const earlier = makeMatch({
      id: 'earlier',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T19:00:00.000Z',
      endedAt: '2026-06-26T21:45:00.000Z',
    });
    const later = makeMatch({
      id: 'later',
      status: MATCH_STATUS.FINISHED,
      utcDate: '2026-06-26T19:30:00.000Z',
      endedAt: '2026-06-26T22:15:00.000Z',
    });
    const result = getRecentlyFinishedMatches([earlier, later], now);
    expect(result.map((m) => m.id)).toEqual(['later', 'earlier']);
  });

  it('handles empty / nullish inputs', () => {
    expect(getRecentlyFinishedMatches([], Date.now())).toEqual([]);
    expect(getRecentlyFinishedMatches(null, Date.now())).toEqual([]);
  });
});
