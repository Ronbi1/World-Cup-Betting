const express = require('express');
const { supabase } = require('../config/supabase');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminOnly');
const { sendApprovalEmail } = require('../services/email');

const router = express.Router();

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

// ─── GET /users ───────────────────────────────────────────────────────────────
// Returns all users. Admin only — never expose passwords.
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, status, created_at, bet, scores')
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Normalize field names for the frontend
    const users = data.map(u => ({ ...u, createdAt: u.created_at }));

    res.json(users);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /users/:id/status ──────────────────────────────────────────────────
// Admin approves or rejects a user registration. Sends email on approval.
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status value
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `Status must be one of: ${VALID_STATUSES.join(', ')}.`,
      });
    }

    // Fetch the user first so we can send the email with their name/email
    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('id, email, name, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Update status in DB
    const { error: updateError } = await supabase
      .from('users')
      .update({ status })
      .eq('id', id);

    if (updateError) throw updateError;

    // Send approval email (non-blocking — email failure won't break the response)
    if (status === 'APPROVED') {
      sendApprovalEmail(existing.email, existing.name); // intentionally not awaited
    }

    res.json({ id, status });
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /users/:id ────────────────────────────────────────────────────────
// Permanently removes a user and all their predictions. Admin only.
// Cannot delete yourself (the admin account).
router.delete('/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (req.user.id === id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    // Verify user exists — use maybeSingle() so "not found" returns null, not an error
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

    // Prevent deleting other admins
    if (existing.role === 'ADMIN') {
      return res.status(403).json({ error: 'Cannot delete another admin account.' });
    }

    // Delete predictions first (foreign key safety) — log but don't fail if none exist
    const { error: predError } = await supabase.from('predictions').delete().eq('user_id', id);
    if (predError) {
      console.warn(`[DELETE /users/${id}] predictions delete warning:`, predError.message);
    }

    // Delete the user
    const { error: deleteError } = await supabase.from('users').delete().eq('id', id);
    if (deleteError) {
      console.error(`[DELETE /users/${id}] user delete failed:`, JSON.stringify(deleteError));
      return res.status(500).json({ error: deleteError.message || 'Failed to delete user from database.' });
    }

    res.json({ id, deleted: true });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /users/:id/bet ─────────────────────────────────────────────────────
// Updates the user's tournament bet (winning team, top scorer, top assist).
// Users can only update their own bet.
router.patch('/:id/bet', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Users can only update their own bet (admins can update anyone's)
    if (req.user.id !== id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'You can only update your own bet.' });
    }

    const { winningTeam, topScorer, topAssist } = req.body;

    const bet = {
      winningTeam: winningTeam || null,
      topScorer:   topScorer   || null,
      topAssist:   topAssist   || null,
    };

    const { error } = await supabase
      .from('users')
      .update({ bet })
      .eq('id', id);

    if (error) throw error;

    res.json({ bet });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
