// /api/cron/* — scheduled-only endpoints.
//
// /refresh-matches  — full season schedule + teams mirror (every ~10 min).
// /live-scores      — live score/status overlay for in-play matches only
//                     (every minute, gated to live windows). ESPN primary,
//                     worldcup26 fallback.
//
// Both write ONLY to matches_mirror (+ teams_mirror for refresh-matches).
//
// HARD GUARANTEES (also enforced by tests/mirrorRefresh.writeScope.test.js and
// tests/liveScores.writeScope.test.js):
//   * No writes to users, predictions, prediction_edits, tournamentBonus,
//     users.scores, users.bet.
//   * No calls to /api/scores/recalculate.
//   * No imports of scoring.js / computeLeaderboard.
//   * On failure, returns HTTP 500 (per round-2 clarification).

const express = require('express');
const { requireCronAuth } = require('../_lib/cronAuth');
const { refreshMirror } = require('../_lib/mirrorRefresh');
const { refreshLiveScores } = require('../_lib/liveScores');
const { isSimulationMode } = require('../_lib/simulation');

const router = express.Router();

router.get('/refresh-matches', requireCronAuth, async (req, res) => {
  const startedAt = Date.now();
  try {
    if (isSimulationMode()) {
      console.log('[cron/refresh-matches] skipped { reason: "simulation mode" }');
      return res.status(200).json({ ok: true, skipped: 'simulation', ms: 0 });
    }

    const result = await refreshMirror();
    console.log('[cron/refresh-matches] ok', {
      matches: result.matches,
      teams: result.teams,
      ms: result.ms,
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const ms = Date.now() - startedAt;
    console.error('[cron/refresh-matches] failed', {
      ok: false,
      error: err.message,
      code: err.code || null,
      upstreamStatus: err.response?.status || null,
      ms,
    });
    return res.status(500).json({
      ok: false,
      error: err.message || 'Mirror refresh failed.',
      ms,
    });
  }
});

router.get('/live-scores', requireCronAuth, async (req, res) => {
  const startedAt = Date.now();
  try {
    if (isSimulationMode()) {
      console.log('[cron/live-scores] skipped { reason: "simulation mode" }');
      return res.status(200).json({ ok: true, skipped: 'simulation', ms: 0 });
    }

    const result = await refreshLiveScores();
    console.log('[cron/live-scores] ok', result);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    const ms = Date.now() - startedAt;
    console.error('[cron/live-scores] failed', {
      ok: false,
      error: err.message,
      code: err.code || null,
      ms,
    });
    return res.status(500).json({
      ok: false,
      error: err.message || 'Live scores refresh failed.',
      ms,
    });
  }
});

module.exports = router;
