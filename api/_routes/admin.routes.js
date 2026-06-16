// Admin-only diagnostic + manual-trigger routes for the Supabase mirror.
//
// Neither endpoint is exposed in the UI in this PR. Admins curl them with
// their session cookie. Both are gated by requireAuth + requireAdmin +
// requireFreshAdmin — the strongest auth chain in the app.
//
// HARD GUARANTEES (also enforced by tests/mirrorRefresh.writeScope.test.js):
//   * Backfill writes only to matches_mirror + teams_mirror via refreshMirror.
//   * Compare is strictly read-only.
//   * Neither imports scoring.js / computeLeaderboard.
//   * Neither calls /api/scores/recalculate.

const express = require('express');
const { requireAuth, requireAdmin, requireFreshAdmin } = require('../_lib/auth');
const { refreshMirror } = require('../_lib/mirrorRefresh');
const live = require('../_lib/football');
const mirror = require('../_lib/matchesRepo');
const { isSimulationMode } = require('../_lib/simulation');

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

module.exports = router;
