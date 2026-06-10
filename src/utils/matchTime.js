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

export function isMatchToday(utcDate) {
  if (!utcDate) return false;
  const matchDay = ISRAEL_DAY_FMT.format(new Date(utcDate));
  const todayDay = ISRAEL_DAY_FMT.format(new Date());
  return matchDay === todayDay;
}
