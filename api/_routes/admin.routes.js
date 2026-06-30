// Admin-only diagnostic + manual-trigger routes for the Supabase mirror.
//
// All routes are gated by requireAuth + requireAdmin + requireFreshAdmin —
// the strongest auth chain in the app.
//
// HARD GUARANTEES (also enforced by tests/mirrorRefresh.writeScope.test.js):
//   * Backfill writes only to matches_mirror + teams_mirror via refreshMirror.
//   * Compare is strictly read-only.
//   * Regulation override writes ONLY to matches_mirror (a single row's
//     `normalized.score.regulation`) and busts the leaderboard cache; it
//     does NOT call computeLeaderboard or /scores/recalculate (the cache
//     bust lets the next /scores read recompute fresh data via its existing
//     path). scoring.js is not imported here.

const express = require('express');
const { supabase } = require('../_lib/supabase');
const { requireAuth, requireAdmin, requireFreshAdmin } = require('../_lib/auth');
const { refreshMirror } = require('../_lib/mirrorRefresh');
const live = require('../_lib/football');
const mirror = require('../_lib/matchesRepo');
const { isSimulationMode } = require('../_lib/simulation');
const leaderboardCache = require('../_lib/leaderboardCache');

const router = express.Router();

// POST /api/admin/mirror-backfill
// Manual trigger for refreshMirror(). Same logic as the cron — single
// shared function. Used for the initial Phase 2 seed and as an emergency
// "the cron is stuck" escape hatch.
router.post(
  '/mirror-backfill',
  requireAuth,
  requireAdmin,
  requireFreshAdmin,
  async (req, res) => {
    const startedAt = Date.now();
    try {
      if (isSimulationMode()) {
        return res.status(200).json({
          ok: true,
          skipped: 'simulation',
          insertedCount: 0,
          updatedCount: 0,
          totalCount: 0,
          durationMs: 0,
          errors: [],
        });
      }

      const result = await refreshMirror();
      console.log('[admin/mirror-backfill] ok', { triggeredBy: req.user.id, ...result });
      return res.status(200).json({
        ok: true,
        insertedCount: result.matches.inserted + result.teams.inserted,
        updatedCount: result.matches.updated + result.teams.updated,
        totalCount: result.matches.total + result.teams.total,
        durationMs: result.ms,
        errors: result.errors,
        matches: result.matches,
        teams: result.teams,
      });
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      console.error('[admin/mirror-backfill] failed', {
        triggeredBy: req.user?.id,
        error: err.message,
        durationMs,
      });
      return res.status(500).json({
        ok: false,
        error: err.message || 'Mirror backfill failed.',
        durationMs,
        errors: [{ message: err.message }],
      });
    }
  },
);

// GET /api/admin/mirror-compare
// Read-only diff between the live worldcup26 path and the Supabase mirror.
// Used as the verification gate before enabling USE_MATCHES_MIRROR.
// Returns a per-category match boolean. If anything is false, do NOT enable
// the flag.
router.get(
  '/mirror-compare',
  requireAuth,
  requireAdmin,
  requireFreshAdmin,
  async (req, res, next) => {
    try {
      if (isSimulationMode()) {
        return res.status(200).json({ skipped: 'simulation' });
      }

      const [liveAll, liveTeams, mirrorAll, mirrorTeams] = await Promise.all([
        live.fetchSeasonMatches(),
        live.fetchAllTeams(),
        mirror.readAllMatches(),
        mirror.readTeams(),
      ]);

      const liveIds = new Set(liveAll.map((m) => String(m.id)));
      const mirrorIds = new Set(mirrorAll.map((m) => String(m.id)));

      const liveFinishedIds = new Set(
        liveAll.filter((m) => m.status === 'FINISHED').map((m) => String(m.id)),
      );
      const mirrorFinishedIds = new Set(
        mirrorAll.filter((m) => m.status === 'FINISHED').map((m) => String(m.id)),
      );

      const today = new Date().toISOString().slice(0, 10);
      const liveTodayIds = new Set(
        liveAll
          .filter((m) => m.utcDate && m.utcDate.slice(0, 10) === today)
          .map((m) => String(m.id)),
      );
      const mirrorTodayIds = new Set(
        mirrorAll
          .filter((m) => m.utcDate && m.utcDate.slice(0, 10) === today)
          .map((m) => String(m.id)),
      );

      const liveTeamIds = new Set(liveTeams.map((t) => String(t.id)));
      const mirrorTeamIds = new Set(mirrorTeams.map((t) => String(t.id)));

      const onlyIn = (a, b) => [...a].filter((x) => !b.has(x));

      // Per-match score diff for FINISHED matches only — the only thing
      // scoring cares about.
      const liveById = new Map(liveAll.map((m) => [String(m.id), m]));
      const mirrorById = new Map(mirrorAll.map((m) => [String(m.id), m]));
      const scoreDiffs = [];
      for (const id of liveFinishedIds) {
        const L = liveById.get(id);
        const M = mirrorById.get(id);
        if (!M) {
          scoreDiffs.push({ id, reason: 'missing-in-mirror' });
          continue;
        }
        const lh = L?.score?.fullTime?.home ?? null;
        const la = L?.score?.fullTime?.away ?? null;
        const mh = M?.score?.fullTime?.home ?? null;
        const ma = M?.score?.fullTime?.away ?? null;
        if (lh !== mh || la !== ma) {
          scoreDiffs.push({ id, live: { home: lh, away: la }, mirror: { home: mh, away: ma } });
        }
      }

      const report = {
        matchCount: {
          live: liveAll.length,
          mirror: mirrorAll.length,
          match: liveAll.length === mirrorAll.length,
        },
        matchIds: {
          onlyInLive: onlyIn(liveIds, mirrorIds),
          onlyInMirror: onlyIn(mirrorIds, liveIds),
          match:
            onlyIn(liveIds, mirrorIds).length === 0 &&
            onlyIn(mirrorIds, liveIds).length === 0,
        },
        finishedMatchIds: {
          onlyInLive: onlyIn(liveFinishedIds, mirrorFinishedIds),
          onlyInMirror: onlyIn(mirrorFinishedIds, liveFinishedIds),
          match:
            onlyIn(liveFinishedIds, mirrorFinishedIds).length === 0 &&
            onlyIn(mirrorFinishedIds, liveFinishedIds).length === 0,
        },
        scoreDiffs,
        scoreDiffsMatch: scoreDiffs.length === 0,
        todayMatches: {
          live: [...liveTodayIds],
          mirror: [...mirrorTodayIds],
          match:
            onlyIn(liveTodayIds, mirrorTodayIds).length === 0 &&
            onlyIn(mirrorTodayIds, liveTodayIds).length === 0,
        },
        teamCount: {
          live: liveTeams.length,
          mirror: mirrorTeams.length,
          match: liveTeams.length === mirrorTeams.length,
        },
        teamIds: {
          onlyInLive: onlyIn(liveTeamIds, mirrorTeamIds),
          onlyInMirror: onlyIn(mirrorTeamIds, liveTeamIds),
          match:
            onlyIn(liveTeamIds, mirrorTeamIds).length === 0 &&
            onlyIn(mirrorTeamIds, liveTeamIds).length === 0,
        },
      };
      report.allMatch =
        report.matchCount.match &&
        report.matchIds.match &&
        report.finishedMatchIds.match &&
        report.scoreDiffsMatch &&
        report.todayMatches.match &&
        report.teamCount.match &&
        report.teamIds.match;

      return res.status(200).json(report);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/admin/matches/:id/regulation
// Rare-case manual fallback for the auto-capture path in liveScores.js: when
// ESPN never publishes valid period scores for a knockout match that went to
// ET/penalties, the mirror row is left with `score.regulation = null` and
// the scoring engine treats every prediction as unresolved (0 pts). This
// route lets an admin enter the 90' + stoppage-time result by hand. The
// scoring engine reads `score.regulation` automatically on the next /scores
// recompute, so the leaderboard catches up as soon as the cache is busted.
//
// Idempotency: refuses to overwrite an already-populated regulation. The
// auto-capture path is the source of truth — this route only fills in the
// gap when auto-capture didn't.
const MAX_REG_GOALS = 20; // sanity bound — well above any realistic score
function isValidRegScore(v) {
  return Number.isInteger(v) && v >= 0 && v <= MAX_REG_GOALS;
}

// Pure-ish business logic — the Express route is a thin wrapper. Extracted
// so vitest can drive every branch (simulation, not-found, group-stage
// rejection, idempotency conflict, success) with an injected Supabase mock,
// without standing up Express or mocking the auth middleware chain.
async function setMatchRegulation(supabaseClient, { id, home, away }) {
  if (!id) return { status: 400, body: { error: 'Missing match id.' } };
  if (!isValidRegScore(home) || !isValidRegScore(away)) {
    return {
      status: 400,
      body: { error: 'home and away must be integers between 0 and 20.' },
    };
  }

  // Read the current row so we can both verify the match exists, confirm
  // it is a knockout, and merge the new regulation into the existing
  // `normalized` JSONB. Read-modify-write at the application level keeps
  // this portable across Supabase environments where raw jsonb_set RPC may
  // not be exposed.
  const { data: existing, error: readErr } = await supabaseClient
    .from('matches_mirror')
    .select('id, status, stage, normalized')
    .eq('id', id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!existing) return { status: 404, body: { error: 'Match not found.' } };

  const stage = existing.stage || existing.normalized?.stage || 'GROUP_STAGE';
  if (stage === 'GROUP_STAGE') {
    return {
      status: 400,
      body: { error: 'Regulation override is only available for knockout matches.' },
    };
  }

  const currentReg = existing.normalized?.score?.regulation;
  if (currentReg && currentReg.home != null && currentReg.away != null) {
    return {
      status: 409,
      body: {
        error: 'Regulation already recorded for this match. Refuse to overwrite.',
        regulation: currentReg,
      },
    };
  }

  const prevScore = existing.normalized?.score || {};
  const nextNormalized = {
    ...(existing.normalized || {}),
    score: {
      ...prevScore,
      regulation: { home, away },
    },
  };

  const { error: writeErr } = await supabaseClient
    .from('matches_mirror')
    .update({
      normalized: nextNormalized,
      mirror_updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (writeErr) throw writeErr;

  return {
    status: 200,
    body: { ok: true, match: { id, stage, regulation: { home, away } } },
  };
}

router.post(
  '/matches/:id/regulation',
  requireAuth,
  requireAdmin,
  requireFreshAdmin,
  async (req, res, next) => {
    try {
      if (isSimulationMode()) {
        return res.status(403).json({
          error: 'Simulation mode is read-only. Disable VITE_SIMULATION_MODE to set regulation.',
        });
      }

      const id = String(req.params.id || '').trim();
      const { home, away } = req.body || {};
      const result = await setMatchRegulation(supabase, { id, home, away });

      if (result.status === 200) {
        leaderboardCache.bust();
        console.log('[admin/regulation] ok', {
          triggeredBy: req.user?.id,
          matchId: id,
          stage: result.body.match.stage,
          regulation: result.body.match.regulation,
        });
      }
      return res.status(result.status).json(result.body);
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
module.exports.setMatchRegulation = setMatchRegulation;
