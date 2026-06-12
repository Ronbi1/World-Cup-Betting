// Daily spotlights — exact-score hero + chaos pick (most spectacular miss).
// Israel calendar day (Asia/Jerusalem). Only saved predictions count.

const { calcPoints } = require('./scoring');

const MATCH_TIME_ZONE = 'Asia/Jerusalem';
const ISRAEL_DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: MATCH_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toIsraelDateString(utcDate) {
  if (!utcDate) return null;
  const d = new Date(utcDate);
  if (Number.isNaN(d.getTime())) return null;
  return ISRAEL_DAY_FMT.format(d);
}

function getIsraelToday(asOf = Date.now()) {
  return ISRAEL_DAY_FMT.format(new Date(asOf));
}

function shiftIsraelDate(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const base = Date.UTC(y, m - 1, d, 12, 0, 0);
  return ISRAEL_DAY_FMT.format(new Date(base + deltaDays * 86_400_000));
}

function outcome(home, away) {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

function slimMatch(match) {
  return {
    id: match.id,
    utcDate: match.utcDate,
    stage: match.stage ?? null,
    group: match.group ?? null,
    homeTeam: {
      id: match.homeTeam?.id ?? null,
      name: match.homeTeam?.name ?? '',
      shortName: match.homeTeam?.shortName ?? match.homeTeam?.name ?? '',
      tla: match.homeTeam?.tla ?? null,
      crest: match.homeTeam?.crest ?? null,
    },
    awayTeam: {
      id: match.awayTeam?.id ?? null,
      name: match.awayTeam?.name ?? '',
      shortName: match.awayTeam?.shortName ?? match.awayTeam?.name ?? '',
      tla: match.awayTeam?.tla ?? null,
      crest: match.awayTeam?.crest ?? null,
    },
    score: {
      fullTime: {
        home: match.score?.fullTime?.home ?? null,
        away: match.score?.fullTime?.away ?? null,
      },
    },
  };
}

function resolvePrimary(dayWinners, asOf) {
  dayWinners.sort((a, b) => b.date.localeCompare(a.date));

  const today = getIsraelToday(asOf);
  const yesterday = shiftIsraelDate(today, -1);

  let primaryEntry = dayWinners.find((d) => d.date === today) ?? null;
  let period = 'today';

  if (!primaryEntry) {
    primaryEntry = dayWinners.find((d) => d.date === yesterday) ?? null;
    period = primaryEntry ? 'yesterday' : 'date';
  }

  if (!primaryEntry && dayWinners.length > 0) {
    primaryEntry = dayWinners[0];
    period = 'date';
  }

  const primary = primaryEntry
    ? { date: primaryEntry.date, period, ...primaryEntry.payload }
    : null;

  const history = dayWinners
    .filter((d) => !primary || d.date !== primary.date)
    .slice(0, 7)
    .map((d) => ({ date: d.date, ...d.payload }));

  return { primary, history };
}

// ── Exact score ─────────────────────────────────────────────────────────────
function compareExactCandidates(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  const goalsA = a.actualHome + a.actualAway;
  const goalsB = b.actualHome + b.actualAway;
  if (goalsB !== goalsA) return goalsB - goalsA;
  if (a.coExactCount !== b.coExactCount) return a.coExactCount - b.coExactCount;
  return new Date(b.match.utcDate).getTime() - new Date(a.match.utcDate).getTime();
}

function toExactPayload(entry, dayStats) {
  return {
    userId: entry.userId,
    name: entry.name,
    points: entry.points,
    prediction: { home: entry.predHome, away: entry.predAway },
    match: slimMatch(entry.match),
    exactCountOnDay: dayStats.exactCount,
    coExactOnMatch: entry.coExactCount,
    soloExact: entry.coExactCount === 1,
  };
}

function computeExactSpotlight({ users, finishedMatches, predictions, asOf = Date.now() }) {
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  const exactByMatch = new Map();

  for (const p of predictions ?? []) {
    if (!userNameById.has(p.user_id)) continue;
    const match = (finishedMatches ?? []).find((m) => String(m.id) === String(p.match_id));
    if (!match) continue;

    const result = calcPoints({ home: p.home, away: p.away }, match);
    if (!result.exact) continue;

    const key = String(match.id);
    if (!exactByMatch.has(key)) exactByMatch.set(key, []);
    exactByMatch.get(key).push({
      userId: p.user_id,
      name: userNameById.get(p.user_id),
      predHome: p.home,
      predAway: p.away,
      points: result.points,
      actualHome: match.score.fullTime.home,
      actualAway: match.score.fullTime.away,
      match,
    });
  }

  const candidatesByDay = new Map();
  for (const [, entries] of exactByMatch) {
    const coExactCount = entries.length;
    for (const entry of entries) {
      const day = toIsraelDateString(entry.match.utcDate);
      if (!day) continue;
      if (!candidatesByDay.has(day)) candidatesByDay.set(day, []);
      candidatesByDay.get(day).push({ ...entry, coExactCount });
    }
  }

  const dayWinners = [];
  for (const [date, candidates] of candidatesByDay) {
    const winner = [...candidates].sort(compareExactCandidates)[0];
    if (!winner) continue;
    dayWinners.push({
      date,
      payload: toExactPayload(winner, { exactCount: candidates.length }),
    });
  }

  return resolvePrimary(dayWinners, asOf);
}

// ── Chaos pick (funniest miss) ──────────────────────────────────────────────
// Chaos score: per-goal error + total-goals error + wrong-result bonus +
// reversed-winner bonus. Exact hits are excluded.
function chaosScore(predHome, predAway, actualHome, actualAway, calcResult) {
  if (calcResult.exact) return -1;

  const goalError =
    Math.abs(predHome - actualHome) + Math.abs(predAway - actualAway);
  const totalError = Math.abs(
    (predHome + predAway) - (actualHome + actualAway),
  );
  const wrongResultBonus = calcResult.correct ? 0 : 8;
  const predOut = outcome(predHome, predAway);
  const actualOut = outcome(actualHome, actualAway);
  const reversedBonus =
    predOut !== 'draw' && actualOut !== 'draw' && predOut !== actualOut ? 5 : 0;

  return goalError + totalError + wrongResultBonus + reversedBonus;
}

function compareChaosCandidates(a, b) {
  if (b.chaos !== a.chaos) return b.chaos - a.chaos;
  return new Date(b.match.utcDate).getTime() - new Date(a.match.utcDate).getTime();
}

function toChaosPayload(entry) {
  return {
    userId: entry.userId,
    name: entry.name,
    prediction: { home: entry.predHome, away: entry.predAway },
    match: slimMatch(entry.match),
    goalGap: entry.goalGap,
    wrongResult: entry.wrongResult,
  };
}

function computeChaosPick({ users, finishedMatches, predictions, asOf = Date.now() }) {
  const userNameById = new Map((users ?? []).map((u) => [u.id, u.name]));
  const candidatesByDay = new Map();

  for (const p of predictions ?? []) {
    if (!userNameById.has(p.user_id)) continue;
    const match = (finishedMatches ?? []).find((m) => String(m.id) === String(p.match_id));
    if (!match) continue;

    const actualHome = match.score.fullTime.home;
    const actualAway = match.score.fullTime.away;
    const result = calcPoints({ home: p.home, away: p.away }, match);
    const chaos = chaosScore(p.home, p.away, actualHome, actualAway, result);
    if (chaos < 0) continue;

    const day = toIsraelDateString(match.utcDate);
    if (!day) continue;

    const entry = {
      userId: p.user_id,
      name: userNameById.get(p.user_id),
      predHome: p.home,
      predAway: p.away,
      actualHome,
      actualAway,
      goalGap: Math.abs(p.home - actualHome) + Math.abs(p.away - actualAway),
      wrongResult: !result.correct,
      chaos,
      match,
    };

    if (!candidatesByDay.has(day)) candidatesByDay.set(day, []);
    candidatesByDay.get(day).push(entry);
  }

  const dayWinners = [];
  for (const [date, candidates] of candidatesByDay) {
    const winner = [...candidates].sort(compareChaosCandidates)[0];
    if (!winner) continue;
    dayWinners.push({ date, payload: toChaosPayload(winner) });
  }

  return resolvePrimary(dayWinners, asOf);
}

function computeSpotlight(args) {
  return {
    exact: computeExactSpotlight(args),
    chaos: computeChaosPick(args),
  };
}

module.exports = {
  MATCH_TIME_ZONE,
  toIsraelDateString,
  getIsraelToday,
  chaosScore,
  computeExactSpotlight,
  computeChaosPick,
  computeSpotlight,
};
