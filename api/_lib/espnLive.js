// ESPN (unofficial) soccer scoreboard — primary live-score source.
//
// One scoreboard call returns score + status + clock for every match in the
// tournament's current slate, so a live tick costs exactly one HTTP request
// regardless of how many games are in play. No API key, no cost.
//
// This module ONLY fetches + parses ESPN. It never touches Supabase and never
// imports scoring.js. The merge/write logic lives in liveScores.js.
//
// Upstream: https://site.api.espn.com/apis/site/v2/sports/soccer/<league>/scoreboard
const axios = require('axios');

const ESPN_LEAGUE = process.env.ESPN_LEAGUE || 'fifa.world'; // 2026 World Cup
const ESPN_BASE = `https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_LEAGUE}`;
const ESPN_TIMEOUT_MS = 10_000;

// ESPN state (pre | in | post) → internal MATCH_STATUS.
// Kept in lock-step with the worldcup26 mapStatus() in football.js so both
// sources write the same status vocabulary into matches_mirror.
function mapEspnStatus(type) {
  const state = type?.state;
  const desc = String(type?.description || '').toLowerCase();
  const short = String(type?.shortDetail || '').toLowerCase();
  if (state === 'post') return 'FINISHED';
  if (state === 'pre') return 'SCHEDULED';
  if (desc.includes('halftime') || desc.includes('half-time') || short === 'ht') {
    return 'PAUSED';
  }
  return 'IN_PLAY';
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

// Unordered FIFA-code key so home/away orientation doesn't matter for lookup.
function codePair(a, b) {
  return [String(a || '').toUpperCase(), String(b || '').toUpperCase()]
    .sort()
    .join('|');
}

// Returns one entry per match: { espnId, date, home/awayCode, home/awayName,
// home/awayScore, status, timeElapsed }. Throws on network/non-2xx so the
// caller can trigger the worldcup26 fallback.
async function fetchEspnScoreboard({ axiosClient = axios } = {}) {
  const res = await axiosClient.get(`${ESPN_BASE}/scoreboard`, {
    timeout: ESPN_TIMEOUT_MS,
    headers: { 'User-Agent': 'wc-betting-live/1.0' },
  });
  const events = res.data?.events ?? [];
  return events.map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const cs = comp.competitors || [];
    const home = cs.find((c) => c.homeAway === 'home') || cs[0] || {};
    const away = cs.find((c) => c.homeAway === 'away') || cs[1] || {};
    const type = ev.status?.type || {};
    const status = mapEspnStatus(type);
    const isLive = status === 'IN_PLAY' || status === 'PAUSED';
    return {
      espnId: String(ev.id),
      date: ev.date,
      homeCode: String(home.team?.abbreviation || '').toUpperCase(),
      awayCode: String(away.team?.abbreviation || '').toUpperCase(),
      homeName: home.team?.displayName ?? null,
      awayName: away.team?.displayName ?? null,
      homeScore: toIntOrNull(home.score),
      awayScore: toIntOrNull(away.score),
      status,
      timeElapsed: isLive ? (ev.status?.displayClock || type.shortDetail || null) : null,
    };
  });
}

// Normalize an ESPN keyEvent type label to a kind we care about for toasts.
// Order matters: a second yellow ("Yellow-Red Card") is a sending-off → red.
function eventKind(typeText) {
  const s = String(typeText || '').toLowerCase();
  if (s.includes('goal')) return 'goal';
  if (s.includes('red')) return 'red';
  if (s.includes('yellow')) return 'yellow';
  if (s.includes('substitution')) return 'sub';
  return 'other';
}

// Per-match events (goals + cards + subs) via the summary endpoint. Only
// called for matches that are actually in play, so the cost is a handful of
// requests per minute. Throws on failure — the caller keeps the prior events.
async function fetchEspnSummaryEvents(espnId, { axiosClient = axios } = {}) {
  const res = await axiosClient.get(`${ESPN_BASE}/summary?event=${encodeURIComponent(espnId)}`, {
    timeout: ESPN_TIMEOUT_MS,
    headers: { 'User-Agent': 'wc-betting-live/1.0' },
  });
  const data = res.data || {};

  // Resolve each event's side from THIS response's own home/away competitors
  // (id/abbreviation/displayName all from ESPN, so they match reliably). The
  // value is ESPN-relative; liveScores re-orients it to the mirror's home/away.
  const cs = data.header?.competitions?.[0]?.competitors || [];
  const homeTeam = cs.find((c) => c.homeAway === 'home')?.team || {};
  const awayTeam = cs.find((c) => c.homeAway === 'away')?.team || {};
  const keysOf = (tm) => [tm.id, tm.abbreviation, tm.displayName]
    .map((v) => String(v ?? '').trim().toLowerCase())
    .filter(Boolean);
  const homeKeys = new Set(keysOf(homeTeam));
  const awayKeys = new Set(keysOf(awayTeam));
  const espnSideOf = (t) => {
    const cand = keysOf(t || {});
    if (cand.some((c) => homeKeys.has(c))) return 'home';
    if (cand.some((c) => awayKeys.has(c))) return 'away';
    return null;
  };

  const keyEvents = data.keyEvents ?? [];
  return keyEvents.map((e) => {
    const kind = eventKind(e.type?.text);
    const clock = e.clock?.displayValue ?? null;
    const team = e.team?.displayName ?? null;
    const players = (e.participants || [])
      .map((p) => p.athlete?.displayName)
      .filter(Boolean);
    return {
      id: String(e.id ?? `${kind}-${clock}-${team}-${players[0] ?? ''}`),
      kind,
      text: e.text ?? e.type?.text ?? null,
      clock,
      period: e.period?.number ?? null,
      team,
      espnSide: espnSideOf(e.team),
      players,
      scoringPlay: e.scoringPlay === true,
    };
  });
}

// Index a scoreboard array by unordered FIFA-code pair for O(1) lookup.
function indexByPair(games) {
  const map = new Map();
  for (const g of games) {
    if (!g.homeCode || !g.awayCode) continue;
    map.set(codePair(g.homeCode, g.awayCode), g);
  }
  return map;
}

module.exports = {
  fetchEspnScoreboard,
  fetchEspnSummaryEvents,
  indexByPair,
  codePair,
  eventKind,
  mapEspnStatus,
  ESPN_BASE,
};
