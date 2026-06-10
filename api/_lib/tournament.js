// World Cup 2026: June 11 – July 19, 2026
// Keep in sync with src/utils/constants.js
const TOURNAMENT_START = new Date('2026-06-11T00:00:00Z');
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
