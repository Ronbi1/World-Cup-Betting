import { MATCH_STATUS } from './constants';

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
