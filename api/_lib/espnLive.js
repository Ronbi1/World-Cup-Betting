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

// ── Regulation-time extraction ───────────────────────────────────────────────
// ESPN soccer scoreboard returns `competitor.linescores` as an ORDERED array of
// per-period score objects: [{ value: N }, ...]. For soccer, periods 1 and 2
// are the first and second half — they together represent regulation time (90'
// + added time). Any further entries are extra time and/or the penalty
// shootout count.
//
// We sum linescores[0..1] to get regulation. If the array is missing or shorter
// than 2 entries, we return null — never guess from the running total.
function regulationFromLinescores(linescores) {
  if (!Array.isArray(linescores) || linescores.length < 2) return null;
  const a = toIntOrNull(linescores[0]?.value);
  const b = toIntOrNull(linescores[1]?.value);
  if (a == null || b == null) return null;
  return a + b;
}

// ESPN status text signals — description / shortDetail can be "Final", "Full
// Time", "Final/AET", "After Extra Time", "Final/PEN", "Penalty Shootout", etc.
// Substring checks are deliberately broad; both regex run against the joined
// lowercase text.
function detectExtraTime(typeDescription, typeShortDetail) {
  const s = `${typeDescription || ''} ${typeShortDetail || ''}`.toLowerCase();
  return /\baet\b|\bet\b|extra\s*time|after\s*extra/i.test(s);
}

function detectPenalties(typeDescription, typeShortDetail) {
  const s = `${typeDescription || ''} ${typeShortDetail || ''}`.toLowerCase();
  return /\bpen\b|penalt/i.test(s);
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
    // Regulation: sum of period-1 + period-2 linescores when present. Stays
    // null if ESPN hasn't published periods yet (e.g. early in the match), or
    // if linescores arrives short. The downstream freeze rule in liveScores.js
    // keeps the previously-captured value if any tick produced one.
    const regulationHomeScore = regulationFromLinescores(home.linescores);
    const regulationAwayScore = regulationFromLinescores(away.linescores);
    // ET/penalty signals: prefer the explicit status text. As a defensive
    // backup, also flag based on linescores length so a match with 4+ periods
    // is treated as having gone to ET even if ESPN labels it just "Final".
    const homeLineCount = Array.isArray(home.linescores) ? home.linescores.length : 0;
    const awayLineCount = Array.isArray(away.linescores) ? away.linescores.length : 0;
    const maxLineCount = Math.max(homeLineCount, awayLineCount);
    const wentToExtraTime = detectExtraTime(type.description, type.shortDetail)
      || detectPenalties(type.description, type.shortDetail)
      || maxLineCount > 2;
    const decidedByPenalties = detectPenalties(type.description, type.shortDetail)
      || maxLineCount > 4;
    return {
      espnId: String(ev.id),
      date: ev.date,
      homeCode: String(home.team?.abbreviation || '').toUpperCase(),
      awayCode: String(away.team?.abbreviation || '').toUpperCase(),
      homeName: home.team?.displayName ?? null,
      awayName: away.team?.displayName ?? null,
      homeScore: toIntOrNull(home.score),
      awayScore: toIntOrNull(away.score),
      regulationHomeScore,
      regulationAwayScore,
      wentToExtraTime,
      decidedByPenalties,
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
  // Match the full "... card" phrase, never bare "red"/"yellow": ESPN labels a
  // converted penalty "Penalty - Scored", and "sco(red)" would match "red".
  // ("Yellow-Red Card" — a second yellow — correctly resolves to red.)
  if (s.includes('red card')) return 'red';
  if (s.includes('yellow card')) return 'yellow';
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
    // A scoring play is always a goal, whatever ESPN labels the type
    // (regular goals are "Goal", penalties are "Penalty - Scored").
    const kind = e.scoringPlay === true ? 'goal' : eventKind(e.type?.text);
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
  regulationFromLinescores,
  detectExtraTime,
  detectPenalties,
  ESPN_BASE,
};
