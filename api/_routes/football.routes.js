// /api/football/* — thin, typed proxy to worldcup26.ir.
// Frontend never sees upstream field names; everything is normalized
// server-side by api/_lib/football.js. See that file for the shape.
const express = require('express');
const {
  fetchSeasonMatches,
  fetchTodayMatches,
  fetchAllTeams,
} = require('../_lib/football');
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

// All matches for the World Cup season.
router.get('/matches', requireAuth, async (req, res, next) => {
  try {
    const matches = await fetchSeasonMatches();
    res.json({ matches });
  } catch (err) {
    sendUpstreamError(res, err, next);
  }
});

// Matches kicking off today (UTC).
router.get('/matches/today', requireAuth, async (req, res, next) => {
  try {
    const matches = await fetchTodayMatches();
    res.json({ matches });
  } catch (err) {
    sendUpstreamError(res, err, next);
  }
});

// All teams in the World Cup (used for the Tournament Winner dropdown).
router.get('/teams', requireAuth, async (req, res, next) => {
  try {
    const teams = await fetchAllTeams();
    res.json({ teams });
  } catch (err) {
    sendUpstreamError(res, err, next);
  }
});

module.exports = router;
