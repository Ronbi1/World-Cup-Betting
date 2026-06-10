// SIMULATION ONLY — in-memory World Cup Day 5 demo data.
// Remove this file (and api/_lib/simulation.js) when deleting simulation mode.
//
// Matches use relative timestamps from Date.now() so finished/live/upcoming
// states stay realistic during a dev session. IDs are prefixed sim-* so they
// never collide with real worldcup26.ir match IDs.

const SIMULATION_VIEWER_USER_ID = 'sim-user-1';

const TEAMS = {
  bra: { id: 'sim-team-bra', name: 'Brazil', shortName: 'Brazil', tla: 'BRA', crest: null },
  arg: { id: 'sim-team-arg', name: 'Argentina', shortName: 'Argentina', tla: 'ARG', crest: null },
  fra: { id: 'sim-team-fra', name: 'France', shortName: 'France', tla: 'FRA', crest: null },
  ger: { id: 'sim-team-ger', name: 'Germany', shortName: 'Germany', tla: 'GER', crest: null },
  esp: { id: 'sim-team-esp', name: 'Spain', shortName: 'Spain', tla: 'ESP', crest: null },
  eng: { id: 'sim-team-eng', name: 'England', shortName: 'England', tla: 'ENG', crest: null },
  por: { id: 'sim-team-por', name: 'Portugal', shortName: 'Portugal', tla: 'POR', crest: null },
  ned: { id: 'sim-team-ned', name: 'Netherlands', shortName: 'Netherlands', tla: 'NED', crest: null },
};

function teamSide(key) {
  const t = TEAMS[key];
  return {
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    tla: t.tla,
    crest: t.crest,
  };
}

function finishedScore(home, away, halfHome = null, halfAway = null) {
  return {
    home,
    away,
    halfHome,
    halfAway,
    winner: null,
    fullTime: { home, away },
  };
}

function liveScore(home, away, halfHome, halfAway) {
  return {
    home,
    away,
    halfHome,
    halfAway,
    winner: null,
    fullTime: { home, away },
  };
}

function emptyScore() {
  return {
    home: null,
    away: null,
    halfHome: null,
    halfAway: null,
    winner: null,
    fullTime: { home: null, away: null },
  };
}

function isoHoursFromNow(now, hours) {
  return new Date(now + hours * 60 * 60 * 1000).toISOString();
}

function buildMatch(now, spec) {
  return {
    id: spec.id,
    utcDate: isoHoursFromNow(now, spec.kickoffHours),
    status: spec.status,
    stage: 'GROUP_STAGE',
    group: spec.group,
    homeTeam: teamSide(spec.home),
    awayTeam: teamSide(spec.away),
    score: spec.score,
    matchday: spec.matchday,
    timeElapsed: spec.timeElapsed ?? null,
    referees: [],
  };
}

// ── Match schedule (12 matches: 6 finished, 2 live, 4 upcoming) ─────────────
function getSimulationMatches(now = Date.now()) {
  return [
    // Yesterday — finished
    buildMatch(now, {
      id: 'sim-001', kickoffHours: -26, status: 'FINISHED', group: 'A',
      home: 'bra', away: 'arg', matchday: 1,
      score: finishedScore(2, 1, 1, 0),
    }),
    buildMatch(now, {
      id: 'sim-002', kickoffHours: -22, status: 'FINISHED', group: 'B',
      home: 'fra', away: 'ger', matchday: 1,
      score: finishedScore(0, 0),
    }),
    // Today — finished
    buildMatch(now, {
      id: 'sim-003', kickoffHours: -6, status: 'FINISHED', group: 'C',
      home: 'esp', away: 'eng', matchday: 2,
      score: finishedScore(3, 1, 2, 0),
    }),
    buildMatch(now, {
      id: 'sim-004', kickoffHours: -4, status: 'FINISHED', group: 'D',
      home: 'por', away: 'ned', matchday: 2,
      score: finishedScore(1, 2, 0, 1),
    }),
    buildMatch(now, {
      id: 'sim-005', kickoffHours: -2, status: 'FINISHED', group: 'A',
      home: 'bra', away: 'fra', matchday: 2,
      score: finishedScore(1, 0, 1, 0),
    }),
    buildMatch(now, {
      id: 'sim-006', kickoffHours: -1, status: 'FINISHED', group: 'B',
      home: 'arg', away: 'ger', matchday: 2,
      score: finishedScore(2, 2, 1, 1),
    }),
    // Today — live
    buildMatch(now, {
      id: 'sim-007', kickoffHours: -1.2, status: 'IN_PLAY', group: 'C',
      home: 'esp', away: 'por', matchday: 3,
      score: liveScore(1, 0, 1, 0),
      timeElapsed: '67',
    }),
    buildMatch(now, {
      id: 'sim-008', kickoffHours: -0.5, status: 'IN_PLAY', group: 'D',
      home: 'eng', away: 'ned', matchday: 3,
      score: liveScore(2, 1, 1, 0),
      timeElapsed: '23',
    }),
    // Today — upcoming
    buildMatch(now, {
      id: 'sim-009', kickoffHours: 2, status: 'SCHEDULED', group: 'A',
      home: 'bra', away: 'esp', matchday: 3,
      score: emptyScore(),
    }),
    buildMatch(now, {
      id: 'sim-010', kickoffHours: 1.5, status: 'SCHEDULED', group: 'B',
      home: 'arg', away: 'por', matchday: 3,
      score: emptyScore(),
    }),
    buildMatch(now, {
      id: 'sim-011', kickoffHours: 3, status: 'SCHEDULED', group: 'C',
      home: 'fra', away: 'eng', matchday: 3,
      score: emptyScore(),
    }),
    // Tomorrow — upcoming
    buildMatch(now, {
      id: 'sim-012', kickoffHours: 26, status: 'SCHEDULED', group: 'D',
      home: 'ger', away: 'ned', matchday: 3,
      score: emptyScore(),
    }),
  ].sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
}

function getSimulationTodayMatches(now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  return getSimulationMatches(now).filter(
    (m) => m.utcDate && m.utcDate.slice(0, 10) === today,
  );
}

function getSimulationFinishedMatches(now = Date.now()) {
  return getSimulationMatches(now).filter((m) => m.status === 'FINISHED');
}

function getSimulationTeams() {
  return Object.values(TEAMS)
    .map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      tla: t.tla,
      crest: t.crest,
      founded: null,
      venue: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Demo users (in-memory only — never written to Supabase) ─────────────────
function getSimulationUsers() {
  return [
    { id: 'sim-user-1', name: 'Alice', bet: { winningTeam: 'Brazil', topScorer: 'Vinicius Jr – Brazil', topAssist: '' }, scores: null },
    { id: 'sim-user-2', name: 'Bob', bet: { winningTeam: 'France', topScorer: 'Kylian Mbappe – France', topAssist: '' }, scores: null },
    { id: 'sim-user-3', name: 'Carlos', bet: { winningTeam: 'Argentina', topScorer: 'Lionel Messi – Argentina', topAssist: '' }, scores: null },
    { id: 'sim-user-4', name: 'Diana', bet: { winningTeam: 'Spain', topScorer: 'Lamine Yamal – Spain', topAssist: '' }, scores: null },
    { id: 'sim-user-5', name: 'Erik', bet: { winningTeam: 'England', topScorer: 'Harry Kane – England', topAssist: '' }, scores: null },
  ];
}

function pred(userId, matchId, home, away) {
  return { user_id: userId, match_id: matchId, home, away };
}

// Predictions crafted so finished-match scoring produces a varied leaderboard:
//   Alice  — 4 exact hits + 1 correct result → triggers +3 exact bonus
//   Bob    — mix of correct results
//   Carlos — mostly wrong
//   Diana  — 2 exact hits
//   Erik   — 1 exact hit
function getSimulationPredictions() {
  return [
    // sim-001 actual 2-1 (BRA-ARG)
    pred('sim-user-1', 'sim-001', 2, 1), // exact
    pred('sim-user-2', 'sim-001', 1, 0), // correct result
    pred('sim-user-3', 'sim-001', 0, 2), // wrong
    pred('sim-user-4', 'sim-001', 2, 1), // exact
    pred('sim-user-5', 'sim-001', 3, 3), // wrong

    // sim-002 actual 0-0
    pred('sim-user-1', 'sim-002', 0, 0), // exact
    pred('sim-user-2', 'sim-002', 1, 1), // correct result (draw)
    pred('sim-user-3', 'sim-002', 2, 0), // wrong
    pred('sim-user-4', 'sim-002', 1, 0), // wrong
    pred('sim-user-5', 'sim-002', 0, 1), // wrong

    // sim-003 actual 3-1 (5 total goals → 5 pts exact)
    pred('sim-user-1', 'sim-003', 3, 1), // exact (5 pts)
    pred('sim-user-2', 'sim-003', 2, 1), // correct result
    pred('sim-user-3', 'sim-003', 1, 1), // wrong
    pred('sim-user-4', 'sim-003', 3, 0), // wrong
    pred('sim-user-5', 'sim-003', 0, 3), // wrong

    // sim-004 actual 1-2
    pred('sim-user-1', 'sim-004', 1, 2), // exact
    pred('sim-user-2', 'sim-004', 0, 2), // correct result
    pred('sim-user-3', 'sim-004', 2, 2), // wrong
    pred('sim-user-4', 'sim-004', 1, 1), // wrong
    pred('sim-user-5', 'sim-004', 1, 2), // exact

    // sim-005 actual 1-0
    pred('sim-user-1', 'sim-005', 1, 0), // exact
    pred('sim-user-2', 'sim-005', 2, 1), // correct result
    pred('sim-user-3', 'sim-005', 0, 0), // wrong
    pred('sim-user-4', 'sim-005', 2, 0), // correct result
    pred('sim-user-5', 'sim-005', 0, 1), // wrong

    // sim-006 actual 2-2
    pred('sim-user-1', 'sim-006', 1, 1), // correct result (draw)
    pred('sim-user-2', 'sim-006', 2, 2), // exact
    pred('sim-user-3', 'sim-006', 3, 0), // wrong
    pred('sim-user-4', 'sim-006', 2, 2), // exact
    pred('sim-user-5', 'sim-006', 1, 0), // wrong

    // Live + upcoming — predictions exist but do not affect leaderboard yet
    pred('sim-user-1', 'sim-007', 2, 0),
    pred('sim-user-2', 'sim-007', 1, 1),
    pred('sim-user-3', 'sim-007', 0, 1),
    pred('sim-user-4', 'sim-007', 1, 0),
    pred('sim-user-5', 'sim-007', 0, 0),

    pred('sim-user-1', 'sim-008', 3, 1),
    pred('sim-user-2', 'sim-008', 2, 0),
    pred('sim-user-3', 'sim-008', 1, 2),
    pred('sim-user-4', 'sim-008', 2, 1),
    pred('sim-user-5', 'sim-008', 1, 1),

    pred('sim-user-1', 'sim-009', 1, 0),
    pred('sim-user-2', 'sim-009', 2, 2),
    pred('sim-user-3', 'sim-009', 0, 1),
    pred('sim-user-4', 'sim-009', 3, 0),
    pred('sim-user-5', 'sim-009', 1, 1),

    pred('sim-user-1', 'sim-010', 2, 1),
    pred('sim-user-2', 'sim-010', 1, 0),
    pred('sim-user-3', 'sim-010', 0, 0),
    pred('sim-user-4', 'sim-010', 1, 1),
    pred('sim-user-5', 'sim-010', 2, 0),

    pred('sim-user-1', 'sim-011', 0, 0),
    pred('sim-user-2', 'sim-011', 1, 1),
    pred('sim-user-3', 'sim-011', 2, 1),
    pred('sim-user-4', 'sim-011', 0, 2),
    pred('sim-user-5', 'sim-011', 3, 3),

    pred('sim-user-1', 'sim-012', 1, 1),
    pred('sim-user-2', 'sim-012', 2, 0),
    pred('sim-user-3', 'sim-012', 0, 2),
    pred('sim-user-4', 'sim-012', 1, 0),
    pred('sim-user-5', 'sim-012', 0, 0),
  ];
}

function getSimulationPredictionsForMatchIds(matchIds) {
  const idSet = new Set(matchIds.map(String));
  return getSimulationPredictions().filter((p) => idSet.has(String(p.match_id)));
}

function getSimulationPredictionsForUser(userId) {
  const simUserIds = new Set(getSimulationUsers().map((u) => u.id));
  const targetId = simUserIds.has(String(userId))
    ? String(userId)
    : SIMULATION_VIEWER_USER_ID;

  return getSimulationPredictions()
    .filter((p) => p.user_id === targetId)
    .map((p) => ({
      ...p,
      user_id: String(userId),
    }));
}

module.exports = {
  SIMULATION_VIEWER_USER_ID,
  getSimulationMatches,
  getSimulationTodayMatches,
  getSimulationFinishedMatches,
  getSimulationTeams,
  getSimulationUsers,
  getSimulationPredictions,
  getSimulationPredictionsForMatchIds,
  getSimulationPredictionsForUser,
};
