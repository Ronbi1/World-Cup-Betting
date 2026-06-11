// World Cup 2026: June 11 – July 19, 2026
// Keep in sync with src/utils/constants.js
//
// Bets lock + Golden Boot reveal at the OPENING MATCH KICKOFF (19:00 UTC on
// June 11), not at start-of-day UTC — otherwise the gate fires hours before
// the tournament actually begins.
//
// NB: this gate stays tied to real wall-clock time even when simulation mode
// is on. Sim mode fakes match data + leaderboard so the UI is testable, but
// it must NOT lock real users' tournament bets or expose everyone's Golden
// Boot picks before the actual kickoff.
const TOURNAMENT_START = new Date('2026-06-11T19:00:00Z');
const TOURNAMENT_ENDED = new Date('2026-07-19T23:59:59Z');

function isTournamentStarted() {
  return Date.now() >= TOURNAMENT_START.getTime();
}

function isTournamentOver() {
  return Date.now() > TOURNAMENT_ENDED.getTime();
}

module.exports = {
  TOURNAMENT_START,
  TOURNAMENT_ENDED,
  isTournamentStarted,
  isTournamentOver,
};
