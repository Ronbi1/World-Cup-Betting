// worldcup26.ir integration. Single source of truth for:
//   - Base URL + optional JWT auth (service account in env)
//   - Cached + single-flight upstream fetcher
//   - Normalization from worldcup26 JSON → the internal shape the rest of
//     the app (frontend + scoring) speaks.
//
// Upstream docs: https://worldcup26.ir/api-docs/
// Live scores are pull-based — their DB updates during matches; we poll via
// the client hooks and keep a short server cache on /get/games.
//
// ── Cache + poll matrix (keep in sync if you change anything) ───────────────
//   Server  /get/games       cache 30 s, single-flight
//   Server  /get/teams       cache 5 min, single-flight, in-memory teams map
//   Server  GET /api/scores  cache 30 s (see scores.routes.js); READ-ONLY
//   Client  useTodayMatches  poll 30 s (live) / 60 s (pre-kickoff) / 5 min
//   Client  useMatches       session cache (no poll)
//   Client  fetchTeams       session cache (no poll)
//   Client  refreshScores    auto on FINISHED transition + 60 s during live
// Adding new fetchers? Reuse `wc26Request` so single-flight + cache apply.
const axios = require('axios');
const {
  isSimulationMode,
  getSimulationMatches,
  getSimulationTodayMatches,
  getSimulationFinishedMatches,
  getSimulationTeams,
} = require('./simulation');

const WC26_BASE = (process.env.WC26_API_BASE_URL || 'https://worldcup26.ir').replace(/\/$/, '');

const GAMES_CACHE_TTL_MS = 30_000;
const DEFAULT_CACHE_TTL_MS = 60_000;

function apiBase() {
  return WC26_BASE;
}

// ── JWT auth (optional — upstream may allow anonymous reads) ─────────────────
let _authToken = null;
let _authExpiresAt = 0;
let _authPromise = null;

async function getAuthToken() {
  const email = process.env.WC26_API_EMAIL;
  const password = process.env.WC26_API_PASSWORD;
  if (!email || !password) return null;

  if (_authToken && Date.now() < _authExpiresAt) return _authToken;
  if (_authPromise) return _authPromise;

  _authPromise = axios
    .post(`${WC26_BASE}/auth/authenticate`, { email, password }, { timeout: 10_000 })
    .then((res) => {
      _authToken = res.data?.token ?? null;
      _authExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
      return _authToken;
    })
    .catch((err) => {
      _authPromise = null;
      throw err;
    })
    .finally(() => {
      _authPromise = null;
    });

  return _authPromise;
}

function clearAuth() {
  _authToken = null;
  _authExpiresAt = 0;
}

// ── Cache + single-flight ───────────────────────────────────────────────────
const cache = new Map();
const inFlight = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttlMs) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function wc26Request(path, { ttlMs = DEFAULT_CACHE_TTL_MS, retryAuth = true } = {}) {
  const cacheKey = path;
  const cached = getCached(cacheKey);
  if (cached) return cached;
  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const promise = (async () => {
    const token = await getAuthToken();
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      const res = await axios.get(`${WC26_BASE}${path}`, { headers, timeout: 15_000 });
      setCache(cacheKey, res.data, ttlMs);
      return res.data;
    } catch (err) {
      if (retryAuth && err.response?.status === 401 && process.env.WC26_API_EMAIL) {
        clearAuth();
        return wc26Request(path, { ttlMs, retryAuth: false });
      }
      throw err;
    }
  })().finally(() => inFlight.delete(cacheKey));

  inFlight.set(cacheKey, promise);
  return promise;
}

// Legacy export name used by tests / future routes.
const fetchUpstream = wc26Request;

// ── Status mapping (worldcup26 finished + time_elapsed → MATCH_STATUS) ───────
function mapStatus(finished, timeElapsed) {
  if (String(finished).toUpperCase() === 'TRUE') return 'FINISHED';

  const te = String(timeElapsed || '').trim().toLowerCase();
  if (!te || te === 'notstarted') return 'SCHEDULED';
  if (te === 'ht' || te === 'halftime' || te === 'half time' || te === 'half-time') {
    return 'PAUSED';
  }
  if (te === 'live' || te === 'inplay' || te === 'in play' || te === '1h' || te === '2h') {
    return 'IN_PLAY';
  }
  if (/^\d/.test(te) || te.includes("'") || te.endsWith('+')) return 'IN_PLAY';

  return 'SCHEDULED';
}

// ── Stage mapping (worldcup26 type / group → internal STAGE_ORDER values) ────
function mapStage(type, group) {
  const t = String(type || '').toLowerCase();
  if (t === 'r32') return 'ROUND_OF_32';
  if (t === 'r16') return 'ROUND_OF_16';
  if (t === 'qf') return 'QUARTER_FINALS';
  if (t === 'sf') return 'SEMI_FINALS';
  if (t === 'third') return 'THIRD_PLACE';
  if (t === 'final') return 'FINAL';
  if (t === 'group') return 'GROUP_STAGE';

  const g = String(group || '').toUpperCase();
  if (g === 'R32') return 'ROUND_OF_32';
  if (g === 'R16') return 'ROUND_OF_16';
  if (g === 'QF') return 'QUARTER_FINALS';
  if (g === 'SF') return 'SEMI_FINALS';
  if (g === '3RD') return 'THIRD_PLACE';
  if (g === 'FINAL') return 'FINAL';

  return 'GROUP_STAGE';
}

// worldcup26.ir returns `local_date` in the venue's wall-clock time, NOT
// UTC — e.g. "06/11/2026 13:00" for the Mexico City opener means 13:00
// Mexico time (19:00 UTC). Treating it as UTC offsets every kickoff by the
// host city's UTC offset (the bug we hit when "Starts in 2h 55m" showed
// for a match that was actually 9h away in Israel time).
//
// The tournament runs entirely in mid-June through mid-July 2026, so DST
// rules are stable across the whole window: every US/Canadian venue is on
// summer time, and Mexico has been year-round UTC-6 since 2022. Hardcoded
// integer offsets are correct for this tournament and cheaper than a
// timezone library; revisit if the schedule ever stretches outside DST.
const STADIUM_UTC_OFFSET_HOURS = {
  // Mexico (year-round UTC-6, no DST)
  '1': -6, // Estadio Azteca, Mexico City
  '2': -6, // Estadio Akron, Guadalajara
  '3': -6, // Estadio BBVA, Monterrey
  // US Central (CDT, UTC-5)
  '4': -5, // AT&T Stadium, Dallas
  '5': -5, // NRG Stadium, Houston
  '6': -5, // Arrowhead Stadium, Kansas City
  // US Eastern (EDT, UTC-4)
  '7': -4, // Mercedes-Benz Stadium, Atlanta
  '8': -4, // Hard Rock Stadium, Miami
  '9': -4, // Gillette Stadium, Boston
  '10': -4, // Lincoln Financial Field, Philadelphia
  '11': -4, // MetLife Stadium, New York/New Jersey
  // Canada Eastern (EDT, UTC-4)
  '12': -4, // BMO Field, Toronto
  // Canada / US Pacific (PDT, UTC-7)
  '13': -7, // BC Place, Vancouver
  '14': -7, // Lumen Field, Seattle
  '15': -7, // Levi's Stadium, San Francisco Bay Area
  '16': -7, // SoFi Stadium, Los Angeles
};

// Fallback when stadium_id is missing or unmapped. UTC-6 (Mexico City) is
// the most common offset across the group stage and keeps pre-knockout
// "TBD venue" placeholders in the right rough window.
const DEFAULT_VENUE_OFFSET_HOURS = -6;

function parseLocalDate(raw, stadiumId) {
  if (!raw) return null;
  const [datePart, timePart = '00:00'] = String(raw).trim().split(' ');
  const [month, day, year] = datePart.split('/').map((v) => parseInt(v, 10));
  if (!month || !day || !year) return null;
  const [hour, minute] = timePart.split(':').map((v) => parseInt(v, 10) || 0);

  const offsetHours = stadiumId != null && STADIUM_UTC_OFFSET_HOURS[String(stadiumId)] !== undefined
    ? STADIUM_UTC_OFFSET_HOURS[String(stadiumId)]
    : DEFAULT_VENUE_OFFSET_HOURS;

  // Venue-local clock − UTC offset = UTC instant. For UTC-6 (Mexico City),
  // "13:00 local" → 13:00 − (−6) = 19:00 UTC. Subtract via the hour arg.
  const d = new Date(Date.UTC(year, month - 1, day, hour - offsetHours, minute));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function teamTla(name) {
  if (!name) return '???';
  const cleaned = String(name).replace(/[^A-Za-z\u00C0-\u024F]/g, '');
  return cleaned.slice(0, 3).toUpperCase() || '???';
}

// ── Server-side team cache (keyed by team id) ───────────────────────────────
let _teamsById = null;
let _teamsPromise = null;

function ensureTeams() {
  if (_teamsById) return Promise.resolve();
  if (_teamsPromise) return _teamsPromise;

  _teamsPromise = wc26Request('/get/teams', { ttlMs: 5 * 60_000 })
    .then((data) => {
      _teamsById = {};
      for (const t of data?.teams ?? []) {
        _teamsById[String(t.id)] = t;
      }
    })
    .catch((err) => {
      _teamsPromise = null;
      throw err;
    });

  return _teamsPromise;
}

function lookupTeam(id) {
  if (!id || id === '0' || !_teamsById) return null;
  return _teamsById[String(id)] ?? null;
}

function buildTeamSide({ teamId, labelEn, labelFa }) {
  const meta = lookupTeam(teamId);

  if (meta) {
    return {
      id: String(meta.id),
      name: meta.name_en || 'TBD',
      shortName: meta.name_en || 'TBD',
      tla: meta.fifa_code || teamTla(meta.name_en),
      crest: meta.flag ?? null,
    };
  }

  const fallback = labelEn || labelFa || 'TBD';
  return {
    id: teamId && teamId !== '0' ? String(teamId) : null,
    name: fallback,
    shortName: fallback,
    tla: teamTla(fallback),
    crest: null,
  };
}

// ── Transforms (worldcup26 → internal shape) ────────────────────────────────
function transformGame(raw) {
  const homeScore = toIntOrNull(raw.home_score);
  const awayScore = toIntOrNull(raw.away_score);

  return {
    id: String(raw.id),
    utcDate: parseLocalDate(raw.local_date, raw.stadium_id),
    status: mapStatus(raw.finished, raw.time_elapsed),
    stage: mapStage(raw.type, raw.group),
    group: raw.group || null,
    homeTeam: buildTeamSide({
      teamId: raw.home_team_id,
      labelEn: raw.home_team_name_en || raw.home_team_label,
      labelFa: raw.home_team_name_fa,
    }),
    awayTeam: buildTeamSide({
      teamId: raw.away_team_id,
      labelEn: raw.away_team_name_en || raw.away_team_label,
      labelFa: raw.away_team_name_fa,
    }),
    score: {
      home: homeScore,
      away: awayScore,
      halfHome: null,
      halfAway: null,
      winner: null,
      fullTime: { home: homeScore, away: awayScore },
    },
    matchday: toIntOrNull(raw.matchday),
    timeElapsed: raw.time_elapsed && raw.time_elapsed !== 'notstarted'
      ? String(raw.time_elapsed)
      : null,
    referees: [],
  };
}

function transformTeam(raw) {
  return {
    id: String(raw.id),
    name: raw.name_en,
    shortName: raw.name_en,
    tla: raw.fifa_code || teamTla(raw.name_en),
    crest: raw.flag ?? null,
    founded: null,
    venue: null,
  };
}

// ── High-level fetchers used by routes ──────────────────────────────────────
async function fetchAllGamesRaw() {
  await ensureTeams();
  const data = await wc26Request('/get/games', { ttlMs: GAMES_CACHE_TTL_MS });
  return data?.games ?? [];
}

async function fetchSeasonMatches() {
  if (isSimulationMode()) return getSimulationMatches();
  const games = await fetchAllGamesRaw();
  return games
    .map(transformGame)
    .sort((a, b) => new Date(a.utcDate || 0) - new Date(b.utcDate || 0));
}

async function fetchTodayMatches() {
  if (isSimulationMode()) return getSimulationTodayMatches();
  const all = await fetchSeasonMatches();
  const today = new Date().toISOString().slice(0, 10);
  return all.filter((m) => m.utcDate && m.utcDate.slice(0, 10) === today);
}

async function fetchAllTeams() {
  if (isSimulationMode()) return getSimulationTeams();
  await ensureTeams();
  const all = Object.values(_teamsById ?? {});
  return all.map(transformTeam).sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchFinishedMatches() {
  if (isSimulationMode()) return getSimulationFinishedMatches();
  const all = await fetchSeasonMatches();
  return all.filter((m) => m.status === 'FINISHED');
}

// "Has the match started?" — server-side source of truth, used by
// GET  /api/predictions?matchIds=… (read-side defense-in-depth) and
// POST /api/predictions          (write-side kickoff lock).
// A match is started if the kickoff clock has passed OR the upstream
// status flag has already moved out of SCHEDULED. The clock check guards
// against worldcup26's `time_elapsed` flag lagging behind real kickoff.
//
// IMPORTANT: keep in lock-step with hasMatchStarted in
// src/utils/matchTime.js (the frontend mirror used by BetModal +
// LiveBetsReveal). Drift between the two would let the UI and the
// server disagree about lock state.
function hasMatchStarted(match) {
  if (!match) return false;
  if (match.status === 'IN_PLAY' || match.status === 'PAUSED' || match.status === 'FINISHED') {
    return true;
  }
  if (match.utcDate) {
    const kickoff = new Date(match.utcDate).getTime();
    if (!Number.isNaN(kickoff) && Date.now() >= kickoff) return true;
  }
  return false;
}

module.exports = {
  apiBase,
  fetchUpstream,
  getCached,
  transformGame,
  transformTeam,
  fetchSeasonMatches,
  fetchTodayMatches,
  fetchAllTeams,
  fetchFinishedMatches,
  hasMatchStarted,
};
