// Live-score refresh: ESPN primary, worldcup26 fallback.
//
// Called once per minute by /api/cron/live-scores. Flow:
//   1. GATE  — read matches_mirror, keep only matches in a live window
//              (IN_PLAY/PAUSED, or SCHEDULED near kickoff). None → no-op.
//   2. SOURCE — fetch the ESPN scoreboard (one call). If it THROWS, the whole
//              tick falls back to the worldcup26 scraper. A live match ESPN
//              doesn't list also falls back, per match, so nothing goes stale.
//   3. WRITE  — write-on-change ONLY, into matches_mirror only.
//
// HARD WRITE-SCOPE GUARANTEE (mirrors mirrorRefresh.js; enforced by
// tests/liveScores.writeScope.test.js):
//   * Writes ONLY to matches_mirror.
//   * NEVER writes users, predictions, prediction_edits, users.scores, etc.
//   * NEVER calls /api/scores/recalculate. scoring.js is NOT imported here.
const { supabase: defaultSupabase } = require('./supabase');
const {
  fetchEspnScoreboard,
  fetchEspnSummaryEvents,
  indexByPair,
  codePair,
} = require('./espnLive');
const defaultFootball = require('./football');

const LIVE_LOOKAHEAD_MS = 15 * 60_000; // start polling 15 min before kickoff
const LIVE_LOOKBACK_MS = 3 * 60 * 60_000; // ...until 3 h after (covers ET + delays)
const LIVE_OWNED = new Set(['IN_PLAY', 'PAUSED']);

// Is this match worth a live-score check right now? FINISHED matches are
// excluded so we stop polling them — the natural stop condition.
function isLiveWindow(m, now) {
  if (!m) return false;
  if (LIVE_OWNED.has(m.status)) return true;
  if (m.status === 'FINISHED') return false;
  if (!m.utcDate) return false;
  const k = new Date(m.utcDate).getTime();
  if (Number.isNaN(k)) return false;
  return now >= k - LIVE_LOOKAHEAD_MS && now <= k + LIVE_LOOKBACK_MS;
}

// Produce the next `normalized` object, preserving everything (ids, teams,
// crests, stage) and overlaying only the dynamic live fields. This keeps the
// match id stable === predictions.match_id.
//
// REGULATION FREEZE — critical for knockout scoring: once a tick captures
// score.regulation (sum of half-1 + half-2 from ESPN linescores), later ticks
// must NEVER overwrite it. ET goals push fullTime up; regulation stays at the
// 90' value. Same goes for `wentToExtraTime` / `decidedByPenalties` flags —
// once set, they remain set even if a later source omits them.
function buildNormalized(prev, {
  status,
  homeScore,
  awayScore,
  timeElapsed,
  source,
  events,
  regulationHome,
  regulationAway,
  wentToExtraTime,
  decidedByPenalties,
}) {
  const prevScore = prev.score || {};
  const prevReg = prevScore.regulation;
  const hasPrevReg = prevReg && prevReg.home != null && prevReg.away != null;
  // Freeze: keep the prior regulation if any tick already captured it.
  // Otherwise accept this tick's value (only if BOTH sides came back numeric).
  const regulation = hasPrevReg
    ? prevReg
    : (regulationHome != null && regulationAway != null
        ? { home: regulationHome, away: regulationAway }
        : (prevReg ?? null));

  return {
    ...prev,
    status,
    timeElapsed: timeElapsed ?? null,
    score: {
      ...prevScore,
      home: homeScore,
      away: awayScore,
      fullTime: { home: homeScore, away: awayScore },
      regulation,
      wentToExtraTime: !!prevScore.wentToExtraTime || !!wentToExtraTime,
      decidedByPenalties: !!prevScore.decidedByPenalties || !!decidedByPenalties,
    },
    // Keep prior events unless this refresh fetched fresh ones (ESPN only).
    events: events ?? prev.events ?? [],
    _liveSource: source, // telemetry only; harmless extra field on the wire
  };
}

// Orient ESPN's home/away to the mirror match's home/away by FIFA code.
function fromEspn(prev, espn) {
  const mirrorHome = String(prev.homeTeam?.tla || '').toUpperCase();
  const direct = espn.homeCode === mirrorHome;
  return buildNormalized(prev, {
    status: espn.status,
    homeScore: direct ? espn.homeScore : espn.awayScore,
    awayScore: direct ? espn.awayScore : espn.homeScore,
    regulationHome: direct ? espn.regulationHomeScore : espn.regulationAwayScore,
    regulationAway: direct ? espn.regulationAwayScore : espn.regulationHomeScore,
    wentToExtraTime: espn.wentToExtraTime,
    decidedByPenalties: espn.decidedByPenalties,
    timeElapsed: espn.timeElapsed,
    source: 'espn',
  });
}

// worldcup26 fallback never carries regulation/ET signals. Pass nulls so the
// freeze rule preserves whatever ESPN captured earlier in the match. If ESPN
// was down for the entire match, regulation stays null and the scoring engine
// reports the match as unresolved + logs a warning.
function fromWc26(prev, wm) {
  return buildNormalized(prev, {
    status: wm.status,
    homeScore: wm.score?.fullTime?.home ?? null,
    awayScore: wm.score?.fullTime?.away ?? null,
    regulationHome: null,
    regulationAway: null,
    wentToExtraTime: undefined,
    decidedByPenalties: undefined,
    timeElapsed: wm.timeElapsed ?? null,
    source: 'wc26',
  });
}

function eventsSig(m) {
  return (m.events || []).map((e) => e.id).join('|');
}

function changed(prev, next) {
  const prevReg = prev.score?.regulation ?? null;
  const nextReg = next.score?.regulation ?? null;
  const regChanged =
    (prevReg?.home ?? null) !== (nextReg?.home ?? null) ||
    (prevReg?.away ?? null) !== (nextReg?.away ?? null);
  return (
    prev.status !== next.status ||
    (prev.score?.fullTime?.home ?? null) !== (next.score?.fullTime?.home ?? null) ||
    (prev.score?.fullTime?.away ?? null) !== (next.score?.fullTime?.away ?? null) ||
    (prev.timeElapsed ?? null) !== (next.timeElapsed ?? null) ||
    !!prev.score?.wentToExtraTime !== !!next.score?.wentToExtraTime ||
    !!prev.score?.decidedByPenalties !== !!next.score?.decidedByPenalties ||
    regChanged ||
    eventsSig(prev) !== eventsSig(next) // a new card has no score change
  );
}

async function refreshLiveScores({
  supabase = defaultSupabase,
  fetchEspn = fetchEspnScoreboard,
  fetchEspnEvents = fetchEspnSummaryEvents,
  fetchWc26 = defaultFootball.fetchSeasonMatches,
  now = Date.now(),
} = {}) {
  const startedAt = Date.now();
  const nowIso = new Date(now).toISOString();

  // 1. GATE — only live-window matches.
  const { data: rows, error } = await supabase
    .from('matches_mirror')
    .select('id, status, utc_date, normalized');
  if (error) throw error;
  const live = (rows ?? []).map((r) => r.normalized).filter((m) => isLiveWindow(m, now));
  if (live.length === 0) {
    return { live: 0, updated: 0, source: 'none', espnError: null, ms: Date.now() - startedAt };
  }

  // 2. SOURCE — ESPN primary; on error, whole tick falls back to wc26.
  let espnByPair = null;
  let espnError = null;
  try {
    espnByPair = indexByPair(await fetchEspn());
  } catch (err) {
    espnError = err.message || String(err);
  }

  // wc26 is loaded lazily and once — only if ESPN errored or left a match unmatched.
  let wc26ById = null;
  async function wc26() {
    if (!wc26ById) {
      const all = await fetchWc26();
      wc26ById = new Map(all.map((m) => [String(m.id), m]));
    }
    return wc26ById;
  }

  // 3. MERGE + write-on-change.
  const updates = [];
  let usedEspn = false;
  let usedWc26 = false;
  for (const m of live) {
    let next = null;
    if (espnByPair) {
      const espn = espnByPair.get(codePair(m.homeTeam?.tla, m.awayTeam?.tla));
      if (espn) {
        next = fromEspn(m, espn);
        usedEspn = true;
        // Enrich with goal/card events: while in play, AND once more on the
        // transition to FINISHED so a late goal in the dying seconds is
        // captured for the persisted timeline. Best-effort — a summary failure
        // keeps the prior events and never blocks the score update.
        const justFinished = next.status === 'FINISHED' && m.status !== 'FINISHED';
        if (next.status === 'IN_PLAY' || next.status === 'PAUSED' || justFinished) {
          try {
            const events = await fetchEspnEvents(espn.espnId);
            // Re-orient each event's ESPN-relative side to the mirror match's
            // home/away, so the UI can place it on the correct team's side
            // without fragile name matching.
            const mirrorHome = String(m.homeTeam?.tla || '').toUpperCase();
            const direct = espn.homeCode === mirrorHome;
            // Keep the FULL ESPN event list — no cap. A match tops out around
            // ~40-50 keyEvents (a few KB), so there's nothing to bound, and a
            // tail-slice silently dropped early goals (they cluster in the first
            // half and get outnumbered by delay/sub markers).
            next.events = events.map((ev) => ({
              ...ev,
              side: ev.espnSide == null
                ? null
                : direct ? ev.espnSide : (ev.espnSide === 'home' ? 'away' : 'home'),
            }));
          } catch {
            /* keep prior events */
          }
        }
      }
    }
    if (!next) {
      const wm = (await wc26()).get(String(m.id));
      if (wm) {
        next = fromWc26(m, wm);
        usedWc26 = true;
      }
    }
    if (next && changed(m, next)) {
      updates.push({
        id: String(m.id),
        status: next.status,
        home_score: next.score.fullTime.home,
        away_score: next.score.fullTime.away,
        time_elapsed: next.timeElapsed,
        normalized: next,
        mirror_updated_at: nowIso,
      });
    }
  }

  if (updates.length > 0) {
    const { error: upErr } = await supabase
      .from('matches_mirror')
      .upsert(updates, { onConflict: 'id' });
    if (upErr) throw upErr;
  }

  const source = usedEspn && usedWc26 ? 'mixed' : usedWc26 ? 'wc26' : usedEspn ? 'espn' : 'none';
  return { live: live.length, updated: updates.length, source, espnError, ms: Date.now() - startedAt };
}

module.exports = { refreshLiveScores, isLiveWindow };
