// TheSportsDB v1 integration. Single source of truth for:
//   - Base URL + API key composition
//   - Cached + single-flight upstream fetcher (60s TTL)
//   - Normalization from TheSportsDB JSON → the internal shape the rest of
//     the app (frontend + scoring) speaks. Keeping the transform server-side
//     means no duplication and no leaky upstream field names in the UI.
//
// Free tier notes:
//   - Public key '123' works without signup (30 req/min).
//   - Free V1 does NOT provide in-play / live status — events flip directly
//     from "Not Started" to "Match Finished". Live scores require V2 premium.
//   - World Cup league ID is 4429; the 2026 season is "2026".
const axios = require('axios');

const THESPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json';
const LEAGUE_ID = '4429';   // FIFA World Cup
const SEASON = '2026';

function apiKey() {
  return process.env.SPORTSDB_API_KEY || '123';
}

function buildUrl(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  return `${THESPORTSDB_BASE}/${apiKey()}/${path}${qs ? '?' + qs : ''}`;
}

// ── Cache + single-flight ───────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000;
const cache = new Map();    // key → { data, expiresAt }
const inFlight = new Map(); // key → Promise<data>

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data, ttlMs = CACHE_TTL_MS) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

async function fetchUpstream(url) {
  const cached = getCached(url);
  if (cached) return cached;
  if (inFlight.has(url)) return inFlight.get(url);

  const promise = axios
    .get(url, { timeout: 10_000 })
    .then((res) => {
      setCache(url, res.data);
      return res.data;
    })
    .finally(() => inFlight.delete(url));

  inFlight.set(url, promise);
  return promise;
}

// ── Status mapping (TheSportsDB strStatus → internal MATCH_STATUS) ──────────
// Free V1 only emits "Not Started" or finished variants. We still emit the
// full enum the UI knows so any future swap to V2 lights up without changes.
function mapStatus(raw) {
  if (!raw) return 'SCHEDULED';
  const s = String(raw).trim().toUpperCase();
  if (s === 'NOT STARTED' || s === '' || s === 'NS') return 'SCHEDULED';
  if (s === 'MATCH FINISHED' || s === 'FT' || s === 'AET' || s === 'PEN') return 'FINISHED';
  if (s === 'POSTPONED' || s === 'PPD') return 'POSTPONED';
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'CNX') return 'CANCELLED';
  if (s === 'IN PLAY' || s === 'LIVE' || s === '1H' || s === '2H' || s === 'ET') return 'IN_PLAY';
  if (s === 'HT' || s === 'HALF TIME') return 'PAUSED';
  return 'SCHEDULED';
}

// ── Stage mapping (WC 2026 format: 12 groups → R32 → R16 → QF → SF → F) ────
// TheSportsDB's intRound is sometimes string, sometimes number. Default to
// GROUP_STAGE for unknown rounds rather than guessing.
function mapStage(intRound) {
  const r = parseInt(intRound, 10);
  if (Number.isNaN(r)) return 'GROUP_STAGE';
  if (r <= 3) return 'GROUP_STAGE';
  if (r === 4) return 'ROUND_OF_32';
  if (r === 5) return 'ROUND_OF_16';
  if (r === 6) return 'QUARTER_FINALS';
  if (r === 7) return 'SEMI_FINALS';
  if (r === 125) return 'THIRD_PLACE';   // TheSportsDB's convention for 3rd-place
  if (r === 8 || r === 200) return 'FINAL';
  return 'GROUP_STAGE';
}

// ── ISO UTC kickoff from dateEvent + strTimestamp / strTime ─────────────────
function toIsoUtc(raw) {
  if (raw.strTimestamp) {
    const d = new Date(raw.strTimestamp);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (raw.dateEvent && raw.strTime) {
    const d = new Date(`${raw.dateEvent}T${raw.strTime}Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (raw.dateEvent) {
    const d = new Date(`${raw.dateEvent}T00:00:00Z`);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

// ── Server-side team cache (keyed by team id) ───────────────────────────────
// Populated lazily on the first /matches or /teams call so we can decorate
// events with badge URLs. One upstream call per cold-start, then in-memory.
let _teamsByName = null;
let _teamsById = null;
let _teamsPromise = null;

function ensureTeams() {
  if (_teamsByName) return Promise.resolve();
  if (_teamsPromise) return _teamsPromise;

  const url = buildUrl('lookup_all_teams.php', { id: LEAGUE_ID });
  _teamsPromise = fetchUpstream(url)
    .then((data) => {
      const raw = data?.teams ?? [];
      _teamsByName = {};
      _teamsById = {};
      for (const t of raw) {
        _teamsByName[String(t.strTeam).toLowerCase()] = t;
        _teamsById[String(t.idTeam)] = t;
      }
    })
    .catch((err) => {
      _teamsPromise = null;
      throw err;
    });
  return _teamsPromise;
}

function lookupTeam({ id, name }) {
  if (id && _teamsById && _teamsById[String(id)]) return _teamsById[String(id)];
  if (name && _teamsByName && _teamsByName[String(name).toLowerCase()]) {
    return _teamsByName[String(name).toLowerCase()];
  }
  return null;
}

function teamTla(name) {
  if (!name) return '???';
  const cleaned = String(name).replace(/[^A-Za-z\u00C0-\u024F]/g, '');
  return cleaned.slice(0, 3).toUpperCase() || '???';
}

// ── Transforms (TheSportsDB → internal shape) ───────────────────────────────
function transformEvent(raw) {
  const homeMeta = lookupTeam({ id: raw.idHomeTeam, name: raw.strHomeTeam });
  const awayMeta = lookupTeam({ id: raw.idAwayTeam, name: raw.strAwayTeam });

  return {
    id: raw.idEvent,
    utcDate: toIsoUtc(raw),
    status: mapStatus(raw.strStatus),
    stage: mapStage(raw.intRound),
    group: raw.strGroup || null,
    homeTeam: {
      id: raw.idHomeTeam ?? null,
      name: raw.strHomeTeam ?? 'TBD',
      shortName: homeMeta?.strTeamShort || raw.strHomeTeam || 'TBD',
      tla: teamTla(homeMeta?.strTeamShort || raw.strHomeTeam),
      crest: homeMeta?.strTeamBadge ?? null,
    },
    awayTeam: {
      id: raw.idAwayTeam ?? null,
      name: raw.strAwayTeam ?? 'TBD',
      shortName: awayMeta?.strTeamShort || raw.strAwayTeam || 'TBD',
      tla: teamTla(awayMeta?.strTeamShort || raw.strAwayTeam),
      crest: awayMeta?.strTeamBadge ?? null,
    },
    score: {
      home: toIntOrNull(raw.intHomeScore),
      away: toIntOrNull(raw.intAwayScore),
      halfHome: toIntOrNull(raw.intHomeShots),  // TheSportsDB has no half-time
      halfAway: toIntOrNull(raw.intAwayShots),  // score in free V1; leave null.
      winner: null,
      // Shape kept compatible with scoring.js which reads score.fullTime.{home,away}
      fullTime: {
        home: toIntOrNull(raw.intHomeScore),
        away: toIntOrNull(raw.intAwayScore),
      },
    },
    matchday: toIntOrNull(raw.intRound),
    referees: [],
  };
}

function transformTeam(raw) {
  return {
    id: raw.idTeam,
    name: raw.strTeam,
    shortName: raw.strTeamShort || raw.strTeam,
    tla: teamTla(raw.strTeamShort || raw.strTeam),
    crest: raw.strTeamBadge ?? null,
    founded: raw.intFormedYear ?? null,
    venue: raw.strStadium ?? null,
  };
}

// ── High-level fetchers used by routes ──────────────────────────────────────
async function fetchSeasonMatches() {
  await ensureTeams();
  const url = buildUrl('eventsseason.php', { id: LEAGUE_ID, s: SEASON });
  const data = await fetchUpstream(url);
  const events = data?.events ?? [];
  return events.map(transformEvent);
}

async function fetchTodayMatches() {
  await ensureTeams();
  const today = new Date().toISOString().slice(0, 10);
  const url = buildUrl('eventsday.php', { d: today, l: LEAGUE_ID });
  const data = await fetchUpstream(url);
  const events = data?.events ?? [];
  return events.map(transformEvent);
}

async function fetchAllTeams() {
  await ensureTeams();
  const all = Object.values(_teamsById ?? {});
  return all.map(transformTeam).sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchFinishedMatches() {
  const all = await fetchSeasonMatches();
  return all.filter((m) => m.status === 'FINISHED');
}

module.exports = {
  // constants
  THESPORTSDB_BASE,
  LEAGUE_ID,
  SEASON,
  // helpers (exported for tests / future routes)
  buildUrl,
  fetchUpstream,
  getCached,
  transformEvent,
  transformTeam,
  // route-level fetchers
  fetchSeasonMatches,
  fetchTodayMatches,
  fetchAllTeams,
  fetchFinishedMatches,
};
