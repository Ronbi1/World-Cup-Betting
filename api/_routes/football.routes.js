// /api/football/* — thin, typed proxy to worldcup26.ir.
// Frontend never sees upstream field names; everything is normalized
// server-side by api/_lib/football.js. See that file for the shape.
const express = require('express');
const { getCacheState } = require('../_lib/football');
const {
  getSeasonMatches,
  getTodayMatches,
  getAllTeams,
  useMirror,
} = require('../_lib/matchesSource');
const { requireAuth } = require('../_lib/auth');

const router = express.Router();

function sendUpstreamError(res, err, next) {
  if (err.response) {
    const status = err.response.status;
    if (status === 429) return res.status(429).json({ error: 'API rate limit reached. Try again in a minute.' });
    if (status === 401) return res.status(401).json({ error: 'Football API authentication failed.' });
    if (status === 403) return res.status(403).json({ error: 'Football API access denied.' });
    if (status === 404) return res.status(404).json({ error: 'Football data not found.' });
    return res.status(status).json({ error: `Football API error: ${status}` });
  }
  next(err);
}

// onTiming → req.timing.markUpstream bridge.
function timingBridge(req, label) {
  return ({ ms, ok, source }) => {
    if (req?.timing) req.timing.markUpstream({ label, ms, ok, source });
  };
}

// Records cache state for the two upstream paths into the request log.
function noteCacheState(req) {
  if (!req?.timing) return;
  const games = getCacheState('/get/games');
  const teams = getCacheState('/get/teams');
  req.timing.note('cache:/get/games', games);
  req.timing.note('cache:/get/teams', teams);
  // Headline flag for log filtering.
  req.timing.note('cacheHit', games.fresh && teams.fresh);
  req.timing.note('stale', games.stale || teams.stale);
}

// If we ended up serving stale data, attach optional metadata. The body
// keeps its existing shape so older clients are unaffected.
function annotateStale(req, res, body) {
  const games = getCacheState('/get/games');
  const teams = getCacheState('/get/teams');
  if (games.stale || teams.stale) {
    res.setHeader('X-Stale', '1');
    return { ...body, stale: true };
  }
  return body;
}

// All matches for the World Cup season.
router.get('/matches', requireAuth, async (req, res, next) => {
  req.timing?.note('endpoint', 'matches');
  req.timing?.note('source', useMirror() ? 'mirror' : 'live');
  try {
    const matches = await getSeasonMatches({ onTiming: timingBridge(req, 'wc26.games') });
    noteCacheState(req);
    res.json(annotateStale(req, res, { matches }));
  } catch (err) {
    noteCacheState(req);
    sendUpstreamError(res, err, next);
  }
});

// Matches kicking off today (UTC).
router.get('/matches/today', requireAuth, async (req, res, next) => {
  req.timing?.note('endpoint', 'today');
  req.timing?.note('source', useMirror() ? 'mirror' : 'live');
  try {
    const matches = await getTodayMatches({ onTiming: timingBridge(req, 'wc26.games') });
    noteCacheState(req);
    res.json(annotateStale(req, res, { matches }));
  } catch (err) {
    noteCacheState(req);
    sendUpstreamError(res, err, next);
  }
});

// All teams in the World Cup (used for the Tournament Winner dropdown).
router.get('/teams', requireAuth, async (req, res, next) => {
  req.timing?.note('endpoint', 'teams');
  req.timing?.note('source', useMirror() ? 'mirror' : 'live');
  try {
    const teams = await getAllTeams({ onTiming: timingBridge(req, 'wc26.teams') });
    noteCacheState(req);
    res.json(annotateStale(req, res, { teams }));
  } catch (err) {
    noteCacheState(req);
    sendUpstreamError(res, err, next);
  }
});

module.exports = router;
