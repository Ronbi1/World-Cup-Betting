const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth, requireAdmin, requireFreshAdmin } = require('../_lib/auth');
const { hasMatchStarted } = require('../_lib/football');
const { getSeasonMatches, useMirror } = require('../_lib/matchesSource');
const leaderboardCache = require('../_lib/leaderboardCache');
const { timeSupabase } = require('../_lib/requestTiming');
const {
  isSimulationMode,
  getSimulationPredictionsForUser,
  getSimulationPredictionsForMatchIds,
} = require('../_lib/simulation');

const router = express.Router();

// Upper bound on a single team's predicted score.
// IMPORTANT: MUST match MAX_SCORE in src/components/BetModal.jsx so that
// every score the UI allows the user to submit is also accepted by the
// server. Drift here would surface as a 400 on otherwise-valid clicks.
const MAX_PREDICTION_SCORE = 20;

// Resolve which of the given match ids have kicked off. Fail closed (empty
// set) when the football provider is unreachable — same policy as matchIds.
async function filterStartedMatchIds(requestedIds, req) {
  if (!requestedIds.length) return [];

  try {
    const onTiming = ({ ms, ok, source }) => {
      if (req?.timing) req.timing.markUpstream({ label: 'wc26.games', ms, ok, source });
    };
    const allMatches = await getSeasonMatches({ onTiming });
    const matchById = new Map(allMatches.map((m) => [String(m.id), m]));
    return requestedIds.filter((id) => {
      const m = matchById.get(String(id));
      return m ? hasMatchStarted(m) : false;
    });
  } catch (err) {
    req.timing?.note('footballLookupFailed', true);
    req.timing?.setError?.(`football lookup failed: ${err.message}`);
    console.error('[predictions] match-status check failed:', err.message);
    return [];
  }
}

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
      req.timing?.note('mode', matchId ? 'userId+matchId' : 'userId');
      const isSelf = req.user.id === userId;
      const isAdmin = req.user.role === 'ADMIN';

      // SIMULATION ONLY — in-memory demo predictions; no Supabase read.
      if (isSimulationMode()) {
        let rows = getSimulationPredictionsForUser(String(userId));
        if (matchId) {
          rows = rows.filter((p) => String(p.match_id) === String(matchId));
        }
        if (!isSelf && !isAdmin) {
          const startedIds = new Set(
            await filterStartedMatchIds(rows.map((p) => String(p.match_id)), req),
          );
          rows = rows.filter((p) => startedIds.has(String(p.match_id)));
        }
        return res.json(rows);
      }

      const { data, error } = await timeSupabase(
        req,
        matchId ? 'predictions.byUserAndMatch' : 'predictions.byUser',
        () => {
          let q = supabase
            .from('predictions')
            .select('user_id, match_id, home, away')
            .eq('user_id', userId);
          if (matchId) q = q.eq('match_id', String(matchId));
          return q;
        },
      );
      if (error) throw error;

      let rows = data ?? [];

      // Pool members may inspect another player's bets only after kickoff
      // (same privacy model as ?matchIds=). Self and admin see everything.
      if (!isSelf && !isAdmin) {
        const startedIds = new Set(
          await filterStartedMatchIds(rows.map((p) => String(p.match_id)), req),
        );
        rows = rows.filter((p) => startedIds.has(String(p.match_id)));
        req.timing?.note('startedFilter', true);
      }

      req.timing?.note('rows', rows.length);
      return res.json(rows);
    }

    if (matchIds) {
      req.timing?.note('mode', 'matchIds');
      req.timing?.note('source', useMirror() ? 'mirror' : 'live');
      const requestedIds = String(matchIds)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
      req.timing?.note('requestedIds', requestedIds.length);
      if (requestedIds.length === 0) return res.json([]);

      const startedIds = await filterStartedMatchIds(requestedIds, req);

      req.timing?.note('startedIds', startedIds.length);
      if (startedIds.length === 0) return res.json([]);

      // SIMULATION ONLY — in-memory demo predictions; no Supabase read.
      if (isSimulationMode()) {
        return res.json(getSimulationPredictionsForMatchIds(startedIds));
      }

      const { data, error } = await timeSupabase(
        req,
        'predictions.byStartedMatchIds',
        () => supabase
          .from('predictions')
          .select('user_id, match_id, home, away')
          .in('match_id', startedIds),
      );
      if (error) throw error;
      req.timing?.note('rows', (data ?? []).length);
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

    // SIMULATION ONLY — block writes so no demo data reaches Supabase.
    if (isSimulationMode()) {
      return res.status(403).json({
        error: 'Simulation mode is read-only. Disable VITE_SIMULATION_MODE to save real predictions.',
      });
    }

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

    // Kickoff lock — resolve the requested match against the configured
    // source (live worldcup26 or Supabase mirror, gated by USE_MATCHES_MIRROR).
    // Same hasMatchStarted() check on the same transformGame-shape object
    // either way, so the lock outcome is identical for any given (utcDate,
    // status) pair.
    let match;
    try {
      const allMatches = await getSeasonMatches();
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

// POST /api/predictions/admin-edit — admin override.
//
// Bypasses BOTH the ownership check and the kickoff lock that gate the
// normal POST / handler. Every successful call writes an audit row to
// `prediction_edits` so overrides are never silent.
//
// Write order (audit-first):
//   1. Read the existing prediction (may not exist — virtual 0-0).
//   2. INSERT into prediction_edits with old + new values.
//   3. UPSERT into predictions.
//   4. If step 3 fails, DELETE the audit row to avoid an orphan.
//
// This isn't a true transaction (no Supabase RPC in this repo yet) but
// keeps the log honest: an audit entry without a matching prediction
// change is impossible unless the rollback itself fails (logged + warned).
router.post(
  '/admin-edit',
  requireAuth,
  requireAdmin,
  requireFreshAdmin,
  async (req, res, next) => {
    try {
      if (isSimulationMode()) {
        return res.status(403).json({
          error: 'Simulation mode is read-only. Disable VITE_SIMULATION_MODE to override predictions.',
        });
      }

      const { user_id, match_id, home, away, reason } = req.body || {};

      if (!user_id || !match_id) {
        return res.status(400).json({ error: 'user_id and match_id are required.' });
      }

      const homeScore = Number(home);
      const awayScore = Number(away);
      if (
        !Number.isInteger(homeScore) || homeScore < 0 ||
        !Number.isInteger(awayScore) || awayScore < 0 ||
        homeScore > MAX_PREDICTION_SCORE || awayScore > MAX_PREDICTION_SCORE
      ) {
        return res.status(400).json({
          error: `Scores must be integers between 0 and ${MAX_PREDICTION_SCORE}.`,
        });
      }

      // Reason is optional. Cap at 200 chars to match the UI textarea limit.
      const trimmedReason =
        typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : null;

      // Confirm target user exists. Cheaper than letting the upsert FK-check
      // fail and gives a clearer error message.
      const { data: targetUser, error: targetError } = await supabase
        .from('users')
        .select('id')
        .eq('id', String(user_id))
        .single();
      if (targetError || !targetUser) {
        return res.status(404).json({ error: 'Target user not found.' });
      }

      // Read existing prediction so the audit row records true before-state.
      // No row = virtual 0-0; we store null/null in the audit (NOT 0/0) so
      // the log faithfully reflects that the user had never submitted.
      const { data: existing, error: existingError } = await supabase
        .from('predictions')
        .select('home, away')
        .eq('user_id', String(user_id))
        .eq('match_id', String(match_id))
        .maybeSingle();
      if (existingError) throw existingError;

      const auditRow = {
        admin_id: req.user.id,
        target_user_id: String(user_id),
        match_id: String(match_id),
        old_home: existing ? existing.home : null,
        old_away: existing ? existing.away : null,
        new_home: homeScore,
        new_away: awayScore,
        reason: trimmedReason,
      };

      // Step 1 — audit first.
      const { data: insertedAudit, error: auditError } = await supabase
        .from('prediction_edits')
        .insert(auditRow)
        .select('id')
        .single();
      if (auditError) throw auditError;

      // Step 2 — apply the override.
      const { data: upserted, error: upsertError } = await supabase
        .from('predictions')
        .upsert(
          {
            user_id: String(user_id),
            match_id: String(match_id),
            home: homeScore,
            away: awayScore,
          },
          { onConflict: 'user_id,match_id' },
        )
        .select('user_id, match_id, home, away')
        .single();

      if (upsertError) {
        // Roll back the audit row so we don't keep a record of a change
        // that never happened. If the rollback itself fails, log loudly —
        // a noisy audit entry is strictly safer than silent inconsistency.
        const { error: rollbackError } = await supabase
          .from('prediction_edits')
          .delete()
          .eq('id', insertedAudit.id);
        if (rollbackError) {
          console.error(
            '[predictions/admin-edit] audit rollback FAILED — orphan row',
            insertedAudit.id,
            rollbackError.message,
          );
        }
        throw upsertError;
      }

      // Live leaderboard must reflect the override on the next read.
      // Persisted snapshot in users.scores is only refreshed when the admin
      // clicks 🔄 Recalculate; see the plan's "Cache invalidation" section.
      leaderboardCache.bust();

      res.json({
        prediction: upserted,
        edit: { ...auditRow, id: insertedAudit.id },
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/predictions/edits — audit log of admin prediction overrides.
//
// Optional ?matchIds=1,2,3 filter (used by LiveBetsModal to render the
// "Edited by admin" badge for one match without pulling the full history).
//
// Auth-only, NOT admin-only: the audit log IS the accountability layer for
// every participant. Anyone in the pool can see that admin X overrode user
// Y's prediction on match M and why. Hiding the log from non-admins would
// defeat the purpose of having one. The write path stays admin-only.
//
// Joins admin name + target name so the UI can render a readable table
// without secondary lookups.
router.get(
  '/edits',
  requireAuth,
  async (req, res, next) => {
    try {
      const { matchIds, limit } = req.query;

      let query = supabase
        .from('prediction_edits')
        .select('id, admin_id, target_user_id, match_id, old_home, old_away, new_home, new_away, reason, created_at')
        .order('created_at', { ascending: false });

      if (matchIds) {
        const ids = String(matchIds).split(',').map((s) => s.trim()).filter(Boolean);
        if (ids.length === 0) return res.json([]);
        query = query.in('match_id', ids);
      } else {
        // Default cap so a long-running tournament's audit log doesn't ship a
        // monster payload. Bumpable via ?limit.
        const cap = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
        query = query.limit(cap);
      }

      const { data: rows, error } = await query;
      if (error) throw error;

      // Resolve display names in one round-trip per side. Skips empty sets
      // so we don't issue a wildcard .in() query against an empty list.
      const adminIds = [...new Set((rows ?? []).map((r) => r.admin_id))];
      const targetIds = [...new Set((rows ?? []).map((r) => r.target_user_id))];
      const allIds = [...new Set([...adminIds, ...targetIds])];

      let nameById = new Map();
      if (allIds.length > 0) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, name')
          .in('id', allIds);
        if (usersError) throw usersError;
        nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
      }

      const enriched = (rows ?? []).map((r) => ({
        ...r,
        admin_name: nameById.get(r.admin_id) ?? r.admin_id,
        target_user_name: nameById.get(r.target_user_id) ?? r.target_user_id,
      }));

      res.json(enriched);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
