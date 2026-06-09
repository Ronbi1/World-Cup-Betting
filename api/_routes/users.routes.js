const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth, requireAdmin } = require('../_lib/auth');
const { sendApprovalEmail } = require('../_lib/email');

const router = express.Router();

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

// GET /api/users — admin only, never returns password
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, status, created_at, bet, scores')
      .order('created_at', { ascending: true });
    if (error) throw error;

    res.json((data ?? []).map((u) => ({ ...u, createdAt: u.created_at })));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id/status — approve/reject (admin)
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}.` });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { error: updateError } = await supabase.from('users').update({ status }).eq('id', id);
    if (updateError) throw updateError;

    if (status === 'APPROVED') {
      sendApprovalEmail(existing.email, existing.name); // fire-and-forget
    }

    res.json({ id, status });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — admin only, cascades predictions
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user.id === id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`[DELETE /users/${id}] fetch error:`, fetchError.message);
      return res.status(500).json({ error: 'Failed to look up user.' });
    }
    if (!existing) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (existing.role === 'ADMIN') {
      return res.status(403).json({ error: 'Cannot delete another admin account.' });
    }

    const { error: predError } = await supabase.from('predictions').delete().eq('user_id', id);
    if (predError) {
      console.warn(`[DELETE /users/${id}] predictions delete warning:`, predError.message);
    }

    const { error: deleteError } = await supabase.from('users').delete().eq('id', id);
    if (deleteError) {
      console.error(`[DELETE /users/${id}] user delete failed:`, deleteError);
      return res.status(500).json({ error: 'Failed to delete user.' });
    }

    res.json({ id, deleted: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id/bet — user updates their own tournament bet
router.patch('/:id/bet', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (req.user.id !== id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'You can only update your own bet.' });
    }

    const { winningTeam, topScorer, topAssist } = req.body || {};
    const bet = {
      winningTeam: winningTeam || null,
      topScorer: topScorer || null,
      topAssist: topAssist || null,
    };

    const { error } = await supabase.from('users').update({ bet }).eq('id', id);
    if (error) throw error;

    res.json({ bet });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
