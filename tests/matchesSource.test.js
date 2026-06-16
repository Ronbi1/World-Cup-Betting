import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Avoid pulling in axios + Supabase when matchesSource loads its deps.
vi.mock('../api/_lib/football.js', () => ({
  fetchSeasonMatches: vi.fn(),
  fetchTodayMatches: vi.fn(),
  fetchFinishedMatches: vi.fn(),
  fetchAllTeams: vi.fn(),
}));
vi.mock('../api/_lib/matchesRepo.js', () => ({
  readAllMatches: vi.fn(),
  readTodayMatches: vi.fn(),
  readFinishedMatches: vi.fn(),
  readTeams: vi.fn(),
}));

import * as source from '../api/_lib/matchesSource.js';

// isSimulationMode is a plain env-var read (process.env.VITE_SIMULATION_MODE),
// so we drive it via env directly. No mock needed — keeps the test honest
// about the real production behaviour.

describe('matchesSource — useMirror() flag semantics', () => {
  const originalUse = process.env.USE_MATCHES_MIRROR;
  const originalSim = process.env.VITE_SIMULATION_MODE;
  beforeEach(() => {
    delete process.env.VITE_SIMULATION_MODE;
  });
  afterEach(() => {
    process.env.USE_MATCHES_MIRROR = originalUse;
    process.env.VITE_SIMULATION_MODE = originalSim;
  });

  it('defaults to false when env var is unset', () => {
    delete process.env.USE_MATCHES_MIRROR;
    expect(source.useMirror()).toBe(false);
  });

  it('returns false for any value other than the exact string "true"', () => {
    for (const v of ['false', '0', 'TRUE', 'True', '1', 'yes', '']) {
      process.env.USE_MATCHES_MIRROR = v;
      expect(source.useMirror(), `value=${v}`).toBe(false);
    }
  });

  it('returns true only for the exact string "true"', () => {
    process.env.USE_MATCHES_MIRROR = 'true';
    expect(source.useMirror()).toBe(true);
  });

  it('returns false in simulation mode even with flag on', () => {
    process.env.USE_MATCHES_MIRROR = 'true';
    process.env.VITE_SIMULATION_MODE = 'true';
    expect(source.useMirror()).toBe(false);
  });
});
