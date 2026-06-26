import { MATCH_STATUS } from './constants';

// All user-facing match times are rendered in Israel time (Asia/Jerusalem).
// The pool is run from Israel and "20:00 today" should mean the same wall-clock
// time for every participant regardless of the device's timezone. Backend
// storage stays UTC (worldcup26 returns `utcDate`); the timezone is applied
// at render time only, via `Intl.DateTimeFormat`'s `timeZone` option, which
// also handles DST transitions automatically.
const MATCH_TIME_ZONE = 'Asia/Jerusalem';

// "Has the match started?" — single source of truth for the frontend.
//
// A match is considered started if the kickoff clock has passed OR the
// upstream status flag has already moved out of SCHEDULED. The clock
// check guards against worldcup26's `time_elapsed` flag lagging behind
// the real kickoff.
//
// IMPORTANT: keep in lock-step with hasMatchStarted in api/_lib/football.js.
// The server is authoritative — this client mirror is best-effort UX.
export function hasMatchStarted(match) {
  if (!match) return false;
  if (
    match.status === MATCH_STATUS.IN_PLAY ||
    match.status === MATCH_STATUS.PAUSED ||
    match.status === MATCH_STATUS.FINISHED
  ) {
    return true;
  }
  if (match.utcDate) {
    const kickoff = new Date(match.utcDate).getTime();
    if (!Number.isNaN(kickoff) && Date.now() >= kickoff) return true;
  }
  return false;
}

// Format the date portion of a match kickoff in Israel time. Callers pass
// their preferred `Intl.DateTimeFormat` options; the timezone is forced
// here so no caller can accidentally fall back to the browser-local zone.
export function formatMatchDate(
  utcDate,
  locale,
  options = { day: '2-digit', month: 'short', year: 'numeric' },
) {
  return new Date(utcDate).toLocaleDateString(locale, {
    ...options,
    timeZone: MATCH_TIME_ZONE,
  });
}

// Format the time portion of a match kickoff in Israel time. Same contract
// as formatMatchDate — caller controls field selection, helper owns the zone.
export function formatMatchTime(
  utcDate,
  locale,
  options = { hour: '2-digit', minute: '2-digit' },
) {
  return new Date(utcDate).toLocaleTimeString(locale, {
    ...options,
    timeZone: MATCH_TIME_ZONE,
  });
}

// Is the given kickoff on "today" in Israel time? We compare the Asia/Jerusalem
// calendar day for the match against the same for now(). Using en-CA gives a
// stable ISO-style YYYY-MM-DD string regardless of caller locale.
const ISRAEL_DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: MATCH_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function toIsraelDateString(utcDate) {
  if (!utcDate) return null;
  const d = new Date(utcDate);
  if (Number.isNaN(d.getTime())) return null;
  return ISRAEL_DAY_FMT.format(d);
}

export function isMatchToday(utcDate) {
  if (!utcDate) return false;
  const matchDay = toIsraelDateString(utcDate);
  const todayDay = ISRAEL_DAY_FMT.format(new Date());
  return matchDay === todayDay;
}

export function isMatchOnDate(utcDate, isoDate) {
  if (!utcDate || !isoDate) return false;
  return toIsraelDateString(utcDate) === isoDate;
}

// Pure helper: how long until kickoff, broken into days/hours/minutes.
// Returns null when the match has already started (delta <= 0), the kickoff
// is missing, or the date can't be parsed — callers should fall back to the
// status badge in those cases. The delta is computed in absolute UTC
// milliseconds, so the answer is independent of the device timezone.
//
// `now` defaults to `Date.now()`; list pages should pass a shared minute-tick
// value instead so every card on the page re-evaluates from the same instant.
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function getKickoffCountdown(utcDate, now = Date.now()) {
  if (!utcDate) return null;
  const kickoff = new Date(utcDate).getTime();
  if (!Number.isFinite(kickoff)) return null;
  const totalMs = kickoff - now;
  if (totalMs <= 0) return null;

  const days = Math.floor(totalMs / MS_PER_DAY);
  const hours = Math.floor((totalMs % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((totalMs % MS_PER_HOUR) / MS_PER_MINUTE);

  return { totalMs, days, hours, minutes };
}

// i18n-aware countdown string: "Starts in 2d 4h" / "מתחיל בעוד 2 ימים ו־4 שעות".
// Returns null when no countdown should be shown — the caller can use that
// signal to skip rendering entirely. The `t` argument is a react-i18next
// translator; keys live under `matchCard.countdown.*` in both locales.
export function formatKickoffCountdown(utcDate, t, now = Date.now()) {
  const parts = getKickoffCountdown(utcDate, now);
  if (!parts) return null;

  const { totalMs, days, hours, minutes } = parts;

  if (totalMs < MS_PER_MINUTE) return t('matchCard.countdown.soon');
  if (totalMs < MS_PER_HOUR) return t('matchCard.countdown.minutes', { minutes });
  if (totalMs < MS_PER_DAY) {
    return t('matchCard.countdown.hoursMinutes', { hours, minutes });
  }
  return t('matchCard.countdown.daysHours', { days, hours });
}

// ─── HomePage windowing helpers ─────────────────────────────────────────────
// Used by HomePage to split the season-wide match list into:
//   • upcoming        → live + scheduled-with-kickoff in the next N hours
//   • recently finished → FINISHED matches still worth showing as a recap
// Filtering is intentionally on real Date math (never on formatted strings)
// so midnight UTC / Israel-midnight boundaries can't accidentally hide a
// match.

// Generous wall-clock estimate for when a match will be over. Real end
// times aren't in the current match payload — if a future scraper adds
// one (`endedAt` / `finishedAt`) we prefer it; otherwise fall back to
// kickoff + 3 h. The 3 h pad covers regulation (90) + halftime (15) +
// stoppage (~10) + a worst-case knockout ET-plus-penalties tail
// (~30 + 15 + penalty round). Slightly over-shoots for tidy group games —
// by design, since the visibility cutoff that uses this value should
// never yank a FINISHED-flagged match the moment the real whistle blows.
const POST_KICKOFF_PAD_MS = 3 * MS_PER_HOUR;

export function getEstimatedMatchEnd(match) {
  if (!match) return null;
  const explicit = match.endedAt ?? match.finishedAt;
  if (explicit) {
    const d = new Date(explicit);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (!match.utcDate) return null;
  const kickoff = new Date(match.utcDate).getTime();
  if (!Number.isFinite(kickoff)) return null;
  return new Date(kickoff + POST_KICKOFF_PAD_MS);
}

export function getMatchesInNextHours(matches, hoursAhead = 15, now = Date.now()) {
  if (!Array.isArray(matches) || matches.length === 0) return [];
  const windowMs = hoursAhead * MS_PER_HOUR;
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();
  const horizon = nowMs + windowMs;

  return matches
    .filter((m) => {
      if (!m) return false;
      if (m.status === MATCH_STATUS.IN_PLAY || m.status === MATCH_STATUS.PAUSED) {
        return true;
      }
      if (m.status !== MATCH_STATUS.SCHEDULED && m.status !== MATCH_STATUS.TIMED) {
        return false;
      }
      if (!m.utcDate) return false;
      const kickoff = new Date(m.utcDate).getTime();
      if (!Number.isFinite(kickoff)) return false;
      return kickoff >= nowMs && kickoff <= horizon;
    })
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
}

// 24-hour Israel-local 'HH:MM' formatter used by the morning-window rule.
const ISRAEL_HHMM_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: MATCH_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function israelHourMinute(date) {
  const parts = ISRAEL_HHMM_FMT.format(date).split(':');
  return { hour: Number(parts[0]), minute: Number(parts[1]) };
}

// Visibility rule for finished matches on the HomePage:
//   • Normal  → visible for 1 hour after the (real or estimated) end.
//   • Morning → if the end falls between 04:00 and 10:00 Israel time, keep
//               it visible until 19:00 Israel that same day, so users who
//               wake up at 09:00 still see the result on their HomePage.
// DST transitions in Israel happen at 02:00 (Mar/Oct), never inside the
// 04:00–19:00 same-day window, so wall-clock delta == UTC delta.
const MORNING_START_HOUR = 4;
const MORNING_END_HOUR = 10;
const EVENING_CUTOFF_HOUR = 19;
const NORMAL_VISIBLE_MS = MS_PER_HOUR;

export function getRecentlyFinishedMatches(matches, now = Date.now()) {
  if (!Array.isArray(matches) || matches.length === 0) return [];
  const nowMs = typeof now === 'number' ? now : new Date(now).getTime();

  return matches
    .filter((m) => {
      if (!m || m.status !== MATCH_STATUS.FINISHED) return false;
      const end = getEstimatedMatchEnd(m);
      if (!end) return false;
      const endMs = end.getTime();

      const { hour, minute } = israelHourMinute(end);
      let visibleUntilMs;
      if (hour >= MORNING_START_HOUR && hour < MORNING_END_HOUR) {
        const minutesUntil19 = (EVENING_CUTOFF_HOUR - hour) * 60 - minute;
        visibleUntilMs = endMs + minutesUntil19 * MS_PER_MINUTE;
      } else {
        visibleUntilMs = endMs + NORMAL_VISIBLE_MS;
      }
      return nowMs <= visibleUntilMs;
    })
    .sort((a, b) => {
      const ae = getEstimatedMatchEnd(a)?.getTime() ?? 0;
      const be = getEstimatedMatchEnd(b)?.getTime() ?? 0;
      return be - ae;
    });
}
