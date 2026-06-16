const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth, requireAdmin, requireFreshAdmin } = require('../_lib/auth');
const { sendApprovalEmail } = require('../_lib/email');
const { isTournamentStarted } = require('../_lib/tournament');

const router = express.Router();

const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
const VALID_ROLES = ['USER', 'ADMIN'];

// GET /api/users/tournament-bets — approved users' tournament winner / top scorer / assist picks.
// Defense-in-depth: only available after tournament kickoff so pre-start
// picks stay private (mirrors predictions.routes.js match-kickoff gate).
router.get('/tournament-bets', requireAuth, async (req, res, next) => {
  try {
    if (!isTournamentStarted()) {
      return res.status(403).json({ error: 'Tournament bets are not visible until the tournament begins.' });
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, name, bet')
      .eq('status', 'APPROVED')
      .order('name', { ascending: true });

    if (error) throw error;

    const rows = (data ?? []).map((u) => ({
      id: u.id,
      name: u.name,
      winningTeam: u.bet?.winningTeam ?? null,
      topScorer: u.bet?.topScorer ?? null,
      topAssist: u.bet?.topAssist ?? null,
    }));

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/users — admin only, never returns password
router.get('/', requireAuth, requireAdmin, requireFreshAdmin, async (req, res, next) => {
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
router.patch('/:id/status', requireAuth, requireAdmin, requireFreshAdmin, async (req, res, next) => {
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
router.delete('/:id', requireAuth, requireAdmin, requireFreshAdmin, async (req, res, next) => {
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

// PATCH /api/users/:id/role — promote / demote (admin)
// Body: { role: 'USER' | 'ADMIN' }
//
// Last-admin guard: server refuses to demote the only remaining APPROVED
// admin so an accidental click can never lock the pool out of admin actions.
// PENDING/REJECTED admin rows don't count — only effective admins do.
router.patch('/:id/role', requireAuth, requireAdmin, requireFreshAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}.` });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('users')
      .select('id, role, status')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // No-op write — return current role.
    if (existing.role === role) {
      return res.json({ id, role });
    }

    // Last-admin guard fires only on a real demotion of an APPROVED admin.
    if (existing.role === 'ADMIN' && role === 'USER') {
      const { count, error: countError } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'ADMIN')
        .eq('status', 'APPROVED');
      if (countError) throw countError;
      if ((count ?? 0) <= 1) {
        return res.status(403).json({ error: 'Cannot demote the last admin.' });
      }
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ role })
      .eq('id', id);
    if (updateError) throw updateError;

    res.json({ id, role });
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

    if (isTournamentStarted()) {
      return res.status(403).json({ error: 'Tournament bets are locked after kickoff.' });
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
