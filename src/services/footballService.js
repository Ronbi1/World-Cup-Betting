/**
 * footballService.js
 *
 * All communication with the football data source lives here.
 * Calls go through the Express backend (/server/football/*) which:
 *   1. Injects the API token server-side
 *   2. Caches responses (60s TTL) to avoid rate-limit issues
 *   3. Requires JWT auth — serverApi auto-attaches the Bearer token
 */

import serverApi from './serverApi';
import { COMPETITION_CODE } from '../utils/constants';

// ─── Data transformers ────────────────────────────────────────────────────────
// The UI only ever sees these clean shapes – never raw API JSON.

const transformMatch = (raw) => ({
  id: raw.id,
  utcDate: raw.utcDate,
  status: raw.status,
  stage: raw.stage,
  group: raw.group ?? null,
  homeTeam: {
    id: raw.homeTeam?.id ?? null,
    name: raw.homeTeam?.name ?? 'TBD',
    shortName: raw.homeTeam?.shortName ?? 'TBD',
    tla: raw.homeTeam?.tla ?? '???',
    crest: raw.homeTeam?.crest ?? null,
  },
  awayTeam: {
    id: raw.awayTeam?.id ?? null,
    name: raw.awayTeam?.name ?? 'TBD',
    shortName: raw.awayTeam?.shortName ?? 'TBD',
    tla: raw.awayTeam?.tla ?? '???',
    crest: raw.awayTeam?.crest ?? null,
  },
  score: {
    home: raw.score?.fullTime?.home ?? null,
    away: raw.score?.fullTime?.away ?? null,
    halfHome: raw.score?.halfTime?.home ?? null,
    halfAway: raw.score?.halfTime?.away ?? null,
    winner: raw.score?.winner ?? null,
  },
  matchday: raw.matchday ?? null,
  referees: (raw.referees ?? []).map((r) => r.name),
});

const transformTeam = (raw) => ({
  id: raw.id,
  name: raw.name,
  shortName: raw.shortName ?? raw.name,
  tla: raw.tla ?? '???',
  crest: raw.crest ?? null,
  founded: raw.founded ?? null,
  venue: raw.venue ?? null,
});

const transformScorer = (raw) => ({
  id: raw.player?.id ?? null,
  name: raw.player?.name ?? 'Unknown',
  nationality: raw.player?.nationality ?? null,
  team: raw.team?.name ?? 'Unknown',
  teamCrest: raw.team?.crest ?? null,
  goals: raw.goals ?? 0,
  assists: raw.assists ?? 0,
  penalties: raw.penalties ?? 0,
});

// ─── API calls ────────────────────────────────────────────────────────────────

/**
 * Fetch all matches for the World Cup.
 */
export async function fetchMatches() {
  const response = await serverApi.get(`/football/competitions/${COMPETITION_CODE}/matches`);
  const matches = response.data?.matches ?? [];
  return matches.map(transformMatch);
}

/**
 * Fetch only today's matches.
 */
export async function fetchTodayMatches() {
  const today = new Date().toISOString().split('T')[0];
  const response = await serverApi.get(
    `/football/competitions/${COMPETITION_CODE}/matches?dateFrom=${today}&dateTo=${today}`
  );
  const matches = response.data?.matches ?? [];
  return matches.map(transformMatch);
}

/**
 * Fetch matches for a specific stage.
 * @param {string} stage – e.g. 'GROUP_STAGE'
 */
export async function fetchMatchesByStage(stage) {
  const response = await serverApi.get(
    `/football/competitions/${COMPETITION_CODE}/matches?stage=${stage}`
  );
  const matches = response.data?.matches ?? [];
  return matches.map(transformMatch);
}

// ─── Session-level caches (cleared only on hard refresh) ─────────────────────
// These sit in the module so they survive route changes but reset on page reload.
// The server also caches for 60s, but this prevents repeat calls within a session.
let _teamsCache = null;
let _teamsPromise = null;
let _scorersCache = null;
let _scorersPromise = null;

/**
 * Fetch all teams participating in the World Cup.
 * Result is cached for the browser session — only one API call ever made.
 */
export async function fetchTeams() {
  if (_teamsCache) return _teamsCache;
  if (!_teamsPromise) {
    _teamsPromise = serverApi
      .get(`/football/competitions/${COMPETITION_CODE}/teams`)
      .then((res) => {
        const teams = (res.data?.teams ?? []).map(transformTeam);
        _teamsCache = teams;
        return teams;
      })
      .catch((err) => {
        _teamsPromise = null; // allow retry on next call
        throw err;
      });
  }
  return _teamsPromise;
}

/**
 * Fetch the top scorers.
 * Result is cached for the browser session — only one API call ever made.
 */
export async function fetchScorers() {
  if (_scorersCache) return _scorersCache;
  if (!_scorersPromise) {
    _scorersPromise = serverApi
      .get(`/football/competitions/${COMPETITION_CODE}/scorers?limit=20`)
      .then((res) => {
        const scorers = (res.data?.scorers ?? []).map(transformScorer);
        _scorersCache = scorers;
        return scorers;
      })
      .catch((err) => {
        _scorersPromise = null; // allow retry on next call
        throw err;
      });
  }
  return _scorersPromise;
}

/**
 * Fetch competition standings (group tables).
 */
export async function fetchStandings() {
  const response = await serverApi.get(`/football/competitions/${COMPETITION_CODE}/standings`);
  return response.data?.standings ?? [];
}

// ─── Error helper ─────────────────────────────────────────────────────────────
export function parseApiError(err) {
  if (err.response) {
    if (err.response.status === 401) return 'Session expired. Please log in again.';
    if (err.response.status === 403) return 'API token is invalid or missing.';
    if (err.response.status === 404) return 'Competition data not found.';
    if (err.response.status === 429) return 'API rate limit reached. Try again later.';
    return `Server error: ${err.response.status}`;
  }
  if (err.request) return 'Cannot reach the server. Check your connection.';
  return err.message ?? 'An unexpected error occurred.';
}
