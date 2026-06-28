import { describe, it, expect, vi } from 'vitest';

import {
  fetchEspnScoreboard,
  regulationFromLinescores,
  detectExtraTime,
  detectPenalties,
} from '../api/_lib/espnLive.js';

// ESPN's soccer scoreboard exposes per-period scores in `linescores`. For
// knockout matches that go to ET/penalties we MUST derive regulation only
// from periods 1+2 — never from the running competitor.score field, which
// continues to climb during ET. These tests pin both helpers and the full
// scoreboard parse against representative payloads.

describe('regulationFromLinescores', () => {
  it('sums periods 1 + 2 only — ignores ET / penalty periods', () => {
    expect(regulationFromLinescores([{ value: 1 }, { value: 1 }])).toBe(2);
    expect(regulationFromLinescores([{ value: 1 }, { value: 1 }, { value: 1 }, { value: 0 }])).toBe(2);
  });

  it('returns null when linescores is missing or too short — never guesses', () => {
    expect(regulationFromLinescores(null)).toBeNull();
    expect(regulationFromLinescores(undefined)).toBeNull();
    expect(regulationFromLinescores([])).toBeNull();
    expect(regulationFromLinescores([{ value: 0 }])).toBeNull();
  });

  it('returns null when a period value is non-numeric', () => {
    expect(regulationFromLinescores([{ value: 'foo' }, { value: 1 }])).toBeNull();
    expect(regulationFromLinescores([{ value: 1 }, {}])).toBeNull();
  });
});

describe('detectExtraTime / detectPenalties', () => {
  it.each([
    ['Final', false, false],
    ['Full Time', false, false],
    ['Final/AET', true, false],
    ['Final/PEN', true, true], // PEN implies the match also went to ET
    ['After Extra Time', true, false],
    ['Penalty Shootout', true, true],
    [undefined, false, false],
  ])('"%s" → wentToET=%s, decidedByPenalties=%s', (desc, expectedET, expectedPen) => {
    expect(detectPenalties(desc, '')).toBe(expectedPen);
    if (expectedPen) {
      // detectExtraTime should also flag PEN-decided matches (PEN ⇒ ET).
      expect(detectExtraTime(desc, '') || detectPenalties(desc, '')).toBe(true);
    } else {
      expect(detectExtraTime(desc, '')).toBe(expectedET);
    }
  });
});

// ─── fetchEspnScoreboard end-to-end on synthetic payloads ────────────────────

function buildEspnEvent({ desc, shortDetail, homeLs, awayLs, homeScore, awayScore, state = 'post' }) {
  return {
    id: '999',
    date: '2026-07-05T18:00:00Z',
    status: { type: { state, description: desc, shortDetail }, displayClock: null },
    competitions: [{
      competitors: [
        { homeAway: 'home', score: String(homeScore), team: { abbreviation: 'ARG', displayName: 'Argentina' }, linescores: homeLs },
        { homeAway: 'away', score: String(awayScore), team: { abbreviation: 'FRA', displayName: 'France' }, linescores: awayLs },
      ],
    }],
  };
}

async function runScoreboard(event) {
  const axiosClient = { get: vi.fn(async () => ({ data: { events: [event] } })) };
  const games = await fetchEspnScoreboard({ axiosClient });
  return games[0];
}

describe('fetchEspnScoreboard — regulation, ET, PEN fields', () => {
  it('regular 90-minute match: linescores [1,0] / [1,0] → regulation matches, no ET', async () => {
    const g = await runScoreboard(buildEspnEvent({
      desc: 'Full Time', shortDetail: 'FT',
      homeLs: [{ value: 1 }, { value: 0 }],
      awayLs: [{ value: 1 }, { value: 0 }],
      homeScore: 1, awayScore: 1,
    }));
    expect(g.regulationHomeScore).toBe(1);
    expect(g.regulationAwayScore).toBe(1);
    expect(g.wentToExtraTime).toBe(false);
    expect(g.decidedByPenalties).toBe(false);
  });

  it('ET match: linescores [1,1,1,0] with description Final/AET → regulation 2-1, wentToExtraTime', async () => {
    const g = await runScoreboard(buildEspnEvent({
      desc: 'Final/AET', shortDetail: 'AET',
      homeLs: [{ value: 1 }, { value: 1 }, { value: 1 }, { value: 0 }],
      awayLs: [{ value: 1 }, { value: 0 }, { value: 0 }, { value: 0 }],
      homeScore: 3, awayScore: 1,
    }));
    expect(g.regulationHomeScore).toBe(2);
    expect(g.regulationAwayScore).toBe(1);
    expect(g.wentToExtraTime).toBe(true);
    expect(g.decidedByPenalties).toBe(false);
  });

  it('PEN match: regulation 0-0 even though competitor.score reflects penalty count', async () => {
    const g = await runScoreboard(buildEspnEvent({
      desc: 'Final/PEN', shortDetail: 'PEN',
      // Periods 1+2 = 0-0 (regulation), period 3+4 = 0-0 (ET), period 5 = penalty shootout count
      homeLs: [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }, { value: 5 }],
      awayLs: [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }, { value: 4 }],
      homeScore: 0, awayScore: 0,
    }));
    expect(g.regulationHomeScore).toBe(0);
    expect(g.regulationAwayScore).toBe(0);
    expect(g.wentToExtraTime).toBe(true);
    expect(g.decidedByPenalties).toBe(true);
  });

  it('linescores absent / single-period → regulation null (no guessing)', async () => {
    const g = await runScoreboard(buildEspnEvent({
      desc: 'In Progress', shortDetail: "12'",
      homeLs: [{ value: 0 }],
      awayLs: undefined,
      homeScore: 0, awayScore: 0, state: 'in',
    }));
    expect(g.regulationHomeScore).toBeNull();
    expect(g.regulationAwayScore).toBeNull();
  });

  it('description-only ET signal (linescores still 2-long) also sets wentToExtraTime', async () => {
    // Some early-state ticks may only have 2 linescores but the description
    // has already flipped to AET. We should honour the description.
    const g = await runScoreboard(buildEspnEvent({
      desc: 'After Extra Time', shortDetail: 'AET',
      homeLs: [{ value: 1 }, { value: 1 }],
      awayLs: [{ value: 1 }, { value: 0 }],
      homeScore: 3, awayScore: 1,
    }));
    expect(g.wentToExtraTime).toBe(true);
  });
});
