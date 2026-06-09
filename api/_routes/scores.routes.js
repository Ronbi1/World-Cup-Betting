const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth, requireAdmin } = require('../_lib/auth');
const { calcPoints, POINTS } = require('../_lib/scoring');
const { fetchFinishedMatches } = require('../_lib/football');

const router = express.Router();

// GET /api/scores — leaderboard (fast: just reads scores column)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, scores')
      .eq('status', 'APPROVED')
      .eq('role', 'USER');
    if (error) throw error;

    res.json(
      (data ?? []).map((u) => ({
        userId: u.id,
        name: u.name,
        points: u.scores?.points ?? 0,
        correctResults: u.scores?.correctResults ?? 0,
        exactScores: u.scores?.exactScores ?? 0,
      }))
    );
  } catch (err) {
    next(err);
  }
});

// POST /api/scores/recalculate — admin re-tallies all scores from finished matches
router.post('/recalculate', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { tournamentWinner, actualTopScorer, actualTopAssist } = req.body || {};

    const finishedMatches = await fetchFinishedMatches();
    const matchMap = {};
    for (const m of finishedMatches) matchMap[String(m.id)] = m;
    const finishedMatchIds = Object.keys(matchMap);

    let predictions = [];
    if (finishedMatchIds.length > 0) {
      const { data, error: predError } = await supabase
        .from('predictions')
        .select('user_id, match_id, home, away')
        .in('match_id', finishedMatchIds);
      if (predError) throw predError;
      predictions = data ?? [];
    }

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, bet')
      .eq('status', 'APPROVED')
      .eq('role', 'USER');
    if (usersError) throw usersError;

    const userScores = {};
    for (const u of users) userScores[u.id] = { points: 0, correctResults: 0, exactScores: 0 };

    for (const pred of predictions) {
      const match = matchMap[String(pred.match_id)];
      if (!match) continue;
      const result = calcPoints(pred, match);
      if (!userScores[pred.user_id]) {
        userScores[pred.user_id] = { points: 0, correctResults: 0, exactScores: 0 };
      }
      userScores[pred.user_id].points += result.points;
      if (result.correct) userScores[pred.user_id].correctResults += 1;
      if (result.exact) userScores[pred.user_id].exactScores += 1;
    }

    // Tournament bonuses (only when admin supplies actual results)
    const normalize = (s) => (s ?? '').trim().toLowerCase();
    for (const u of users) {
      if (!userScores[u.id]) continue;
      const bet = u.bet ?? {};
      if (tournamentWinner && normalize(bet.winningTeam) === normalize(tournamentWinner)) {
        userScores[u.id].points += POINTS.TOURNAMENT_WINNER;
      }
      if (actualTopScorer && normalize(bet.topScorer) === normalize(actualTopScorer)) {
        userScores[u.id].points += POINTS.TOP_SCORER;
      }
      if (actualTopAssist && normalize(bet.topAssist) === normalize(actualTopAssist)) {
        userScores[u.id].points += POINTS.TOP_ASSIST;
      }
    }

    const updates = Object.entries(userScores).map(([userId, scores]) =>
      supabase.from('users').update({ scores }).eq('id', userId)
    );
    const results = await Promise.all(updates);
    const failedUpdates = results.filter((r) => r.error).map((r) => r.error.message);
    if (failedUpdates.length > 0) console.error('[scores] partial failures:', failedUpdates);

    const statusCode = failedUpdates.length > 0 ? 207 : 200;
    res.status(statusCode).json({
      message: `Scores recalculated for ${Object.keys(userScores).length} users.`,
      finishedMatches: finishedMatches.length,
      updated: Object.keys(userScores).length,
      tournamentBonusesApplied: !!(tournamentWinner || actualTopScorer || actualTopAssist),
      ...(failedUpdates.length > 0 && {
        warning: 'Some score updates failed — leaderboard may be partially stale.',
        errors: failedUpdates,
      }),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
