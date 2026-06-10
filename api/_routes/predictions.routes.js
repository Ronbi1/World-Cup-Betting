const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth } = require('../_lib/auth');
const { fetchSeasonMatches, hasMatchStarted } = require('../_lib/football');

const router = express.Router();

// Upper bound on a single team's predicted score.
// IMPORTANT: MUST match MAX_SCORE in src/components/BetModal.jsx so that
// every score the UI allows the user to submit is also accepted by the
// server. Drift here would surface as a 400 on otherwise-valid clicks.
const MAX_PREDICTION_SCORE = 20;

// GET /api/predictions
//   ?userId=X             → all predictions by a user (ProfilePage)
//   ?userId=X&matchId=Y   → single prediction (BetModal pre-fill)
//   ?matchIds=1,2,3       → all predictions for a set of matches (LiveBetsReveal).
//                           Defense-in-depth: only returns predictions for
//                           matches that have ALREADY KICKED OFF (clock OR
//                           status). The UI also filters, but this guarantees
//                           a malicious client can't read pre-kickoff bets.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { userId, matchId, matchIds } = req.query;

    if (userId) {
      if (req.user.id !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'You can only view your own predictions.' });
      }

      let query = supabase
        .from('predictions')
        .select('user_id, match_id, home, away')
        .eq('user_id', userId);

      if (matchId) query = query.eq('match_id', String(matchId));

      const { data, error } = await query;
      if (error) throw error;
      return res.json(data ?? []);
    }

    if (matchIds) {
      const requestedIds = String(matchIds)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      if (requestedIds.length === 0) return res.json([]);

      // Resolve requested IDs against the season matches cache and keep
      // only those that have started.
      let startedIds = [];
      try {
        const allMatches = await fetchSeasonMatches();
        const matchById = new Map(allMatches.map((m) => [String(m.id), m]));
        startedIds = requestedIds.filter((id) => {
          const m = matchById.get(String(id));
          return m ? hasMatchStarted(m) : false;
        });
      } catch (err) {
        // If the football provider is unreachable, fail closed: return no
        // predictions rather than leaking pre-kickoff bets. The frontend
        // already shows nothing for matches it doesn't know about.
        console.error('[predictions] match-status check failed:', err.message);
        return res.json([]);
      }

      if (startedIds.length === 0) return res.json([]);

      const { data, error } = await supabase
        .from('predictions')
        .select('user_id, match_id, home, away')
        .in('match_id', startedIds);
      if (error) throw error;
      return res.json(data ?? []);
    }

    return res.status(400).json({
      error: 'Provide userId, userId+matchId, or matchIds as query parameters.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/predictions — upsert a single match prediction.
//
// Integrity gate: a prediction can ONLY be saved if the target match has
// not yet kicked off. Admins are NOT exempt — there is no override path.
// On upstream-data failure we fail closed (503) rather than risk
// accepting a write against an unknown match-start state.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { user_id, match_id, home, away } = req.body || {};

    if (req.user.id !== user_id) {
      return res.status(403).json({ error: 'You can only submit your own predictions.' });
    }
    if (!user_id || !match_id) {
      return res.status(400).json({ error: 'user_id and match_id are required.' });
    }

    const homeScore = Number(home);
    const awayScore = Number(away);
    if (!Number.isInteger(homeScore) || homeScore < 0 ||
        !Number.isInteger(awayScore) || awayScore < 0 ||
        homeScore > MAX_PREDICTION_SCORE || awayScore > MAX_PREDICTION_SCORE) {
      return res.status(400).json({
        error: `Scores must be integers between 0 and ${MAX_PREDICTION_SCORE}.`,
      });
    }

    // Kickoff lock — resolve the requested match against the cached upstream
    // schedule and reject writes that arrive after kickoff. fetchSeasonMatches
    // is cached (~30s) so the per-POST cost is a Map build, not a network call.
    let match;
    try {
      const allMatches = await fetchSeasonMatches();
      const matchById = new Map(allMatches.map((m) => [String(m.id), m]));
      match = matchById.get(String(match_id));
    } catch (err) {
      console.error('[predictions] kickoff-lock lookup failed:', err.message);
      return res.status(503).json({
        error: 'Match data temporarily unavailable. Please retry.',
      });
    }

    if (!match) {
      return res.status(404).json({ error: 'Match not found.' });
    }
    if (hasMatchStarted(match)) {
      return res.status(403).json({
        error: 'This match has already kicked off — predictions are locked.',
      });
    }

    const prediction = {
      user_id: String(user_id),
      match_id: String(match_id),
      home: homeScore,
      away: awayScore,
    };

    const { data, error } = await supabase
      .from('predictions')
      .upsert(prediction, { onConflict: 'user_id,match_id' })
      .select('user_id, match_id, home, away')
      .single();
    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
