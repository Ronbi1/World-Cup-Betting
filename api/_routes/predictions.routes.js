const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth } = require('../_lib/auth');

const router = express.Router();

// GET /api/predictions
//   ?userId=X             → all predictions by a user (ProfilePage)
//   ?userId=X&matchId=Y   → single prediction (BetModal pre-fill)
//   ?matchIds=1,2,3       → all predictions for a set of matches (LiveBetsReveal)
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
      const ids = String(matchIds)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      if (ids.length === 0) return res.json([]);

      const { data, error } = await supabase
        .from('predictions')
        .select('user_id, match_id, home, away')
        .in('match_id', ids);
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

// POST /api/predictions — upsert a single match prediction
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
        !Number.isInteger(awayScore) || awayScore < 0) {
      return res.status(400).json({ error: 'Scores must be non-negative integers.' });
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
