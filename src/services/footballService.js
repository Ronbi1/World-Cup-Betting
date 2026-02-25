/**
 * footballService.js
 *
 * All communication with the football data source lives here.
 * Components never call the API directly – they call these functions.
 *
 * ── Future-proof migration path ──────────────────────────────────────────────
 * When you add your own Express server:
 *   1. Set VITE_API_BASE_URL=http://localhost:5000/api/v1 in .env
 *   2. Remove the Vite proxy in vite.config.js
 *   3. Done – zero component changes needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from 'axios';
import { API_BASE_URL, COMPETITION_CODE } from '../utils/constants';

// ─── Axios instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

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
 * @returns {Promise<import('../utils/constants').TransformedMatch[]>}
 */
export async function fetchMatches() {
  const response = await api.get(`/competitions/${COMPETITION_CODE}/matches`);
  const matches = response.data?.matches ?? [];
  return matches.map(transformMatch);
}

/**
 * Fetch only today's matches.
 */
export async function fetchTodayMatches() {
  const today = new Date().toISOString().split('T')[0];
  const response = await api.get(
    `/competitions/${COMPETITION_CODE}/matches?dateFrom=${today}&dateTo=${today}`
  );
  const matches = response.data?.matches ?? [];
  return matches.map(transformMatch);
}

/**
 * Fetch matches for a specific stage.
 * @param {string} stage – e.g. 'GROUP_STAGE'
 */
export async function fetchMatchesByStage(stage) {
  const response = await api.get(
    `/competitions/${COMPETITION_CODE}/matches?stage=${stage}`
  );
  const matches = response.data?.matches ?? [];
  return matches.map(transformMatch);
}

/**
 * Fetch all teams participating in the World Cup.
 */
export async function fetchTeams() {
  const response = await api.get(`/competitions/${COMPETITION_CODE}/teams`);
  const teams = response.data?.teams ?? [];
  return teams.map(transformTeam);
}

/**
 * Fetch the top scorers.
 */
export async function fetchScorers() {
  const response = await api.get(`/competitions/${COMPETITION_CODE}/scorers?limit=20`);
  const scorers = response.data?.scorers ?? [];
  return scorers.map(transformScorer);
}

/**
 * Fetch competition standings (group tables).
 */
export async function fetchStandings() {
  const response = await api.get(`/competitions/${COMPETITION_CODE}/standings`);
  return response.data?.standings ?? [];
}

// ─── Error helper ─────────────────────────────────────────────────────────────
export function parseApiError(err) {
  if (err.response) {
    if (err.response.status === 403) return 'API token is invalid or missing.';
    if (err.response.status === 404) return 'Competition data not found.';
    if (err.response.status === 429) return 'API rate limit reached. Try again later.';
    return `Server error: ${err.response.status}`;
  }
  if (err.request) return 'Cannot reach the server. Check your connection.';
  return err.message ?? 'An unexpected error occurred.';
}
