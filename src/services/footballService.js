/**
 * footballService.js
 *
 * Thin client over /api/football/*. The backend normalizes worldcup26.ir
 * payloads, so the browser never sees upstream field names. All data is
 * served pre-shaped to the internal { id, utcDate, status, stage, group,
 * homeTeam, awayTeam, score, … } contract used by every component.
 */
import serverApi from './serverApi';

export async function fetchMatches() {
  const res = await serverApi.get('/football/matches');
  return res.data?.matches ?? [];
}

export async function fetchTodayMatches() {
  const res = await serverApi.get('/football/matches/today');
  return res.data?.matches ?? [];
}

// Session-level cache — only one /teams call per page load.
let _teamsCache = null;
let _teamsPromise = null;

export async function fetchTeams() {
  if (_teamsCache) return _teamsCache;
  if (!_teamsPromise) {
    _teamsPromise = serverApi
      .get('/football/teams')
      .then((res) => {
        _teamsCache = res.data?.teams ?? [];
        return _teamsCache;
      })
      .catch((err) => {
        _teamsPromise = null;
        throw err;
      });
  }
  return _teamsPromise;
}

export function parseApiError(err) {
  if (err.response) {
    if (err.response.status === 401) return 'Session expired. Please log in again.';
    if (err.response.status === 403) return 'API key is invalid or missing.';
    if (err.response.status === 404) return 'Competition data not found.';
    if (err.response.status === 429) return 'API rate limit reached. Try again later.';
    return `Server error: ${err.response.status}`;
  }
  if (err.request) return 'Cannot reach the server. Check your connection.';
  return err.message ?? 'An unexpected error occurred.';
}
