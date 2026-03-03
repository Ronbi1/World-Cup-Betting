const express = require('express');
const { supabase } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ─── GET /predictions ─────────────────────────────────────────────────────────
// Handles 3 query patterns:
//   ?userId=X             → all predictions by a user (ProfilePage)
//   ?userId=X&matchId=Y   → single prediction for pre-populating BetModal
//   ?matchIds=1,2,3       → all predictions for a set of matches (LiveBetsReveal)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { userId, matchId, matchIds } = req.query;

    // ── Pattern 1 & 2: by userId ──────────────────────────────────────────────
    if (userId) {
      // Security: users can only read their own predictions (admins can read anyone's)
      if (req.user.id !== userId && req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'You can only view your own predictions.' });
      }

      let query = supabase
        .from('predictions')
        .select('user_id, match_id, home, away')
        .eq('user_id', userId);

      // Pattern 2: narrow to a specific match if matchId also provided
      if (matchId) {
        query = query.eq('match_id', String(matchId));
      }

      const { data, error } = await query;
      if (error) throw error;

      return res.json(data ?? []);
    }

    // ── Pattern 3: by matchIds (comma-separated) ──────────────────────────────
    if (matchIds) {
      const ids = matchIds
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        return res.json([]);
      }

      const { data, error } = await supabase
        .from('predictions')
        .select('user_id, match_id, home, away')
        .in('match_id', ids);

      if (error) throw error;

      return res.json(data ?? []);
    }

    // No valid query params provided
    return res.status(400).json({
      error: 'Provide userId, userId+matchId, or matchIds as query parameters.',
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /predictions ────────────────────────────────────────────────────────
// Creates or updates a prediction (upsert).
// The unique constraint on (user_id, match_id) prevents duplicates.
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { user_id, match_id, home, away } = req.body;

    // Security: users can only create predictions for themselves
    if (req.user.id !== user_id) {
      return res.status(403).json({ error: 'You can only submit your own predictions.' });
    }

    // Validate required fields
    if (!user_id || !match_id) {
      return res.status(400).json({ error: 'user_id and match_id are required.' });
    }

    // Validate scores are non-negative integers
    const homeScore = Number(home);
    const awayScore = Number(away);

    if (
      !Number.isInteger(homeScore) || homeScore < 0 ||
      !Number.isInteger(awayScore) || awayScore < 0
    ) {
      return res.status(400).json({ error: 'Scores must be non-negative integers.' });
    }

    const prediction = {
      user_id:  String(user_id),
      match_id: String(match_id),
      home:     homeScore,
      away:     awayScore,
    };

    // Upsert: insert if no row exists, update if (user_id, match_id) already exists.
    // The onConflict targets the primary key constraint defined in Supabase.
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
