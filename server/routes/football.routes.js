const express = require('express');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { FOOTBALL_API_BASE } = require('../config/football'); // SMELL-1 fix: shared config
require('dotenv').config();

const router = express.Router();

// ─── In-memory cache ──────────────────────────────────────────────────────────
// Keyed by full URL (including query string).
// Prevents multiple users from burning through the free-tier rate limit (10 req/min).
// Each entry: { data: <response body>, expiresAt: <timestamp ms> }
//
// Exported so scores.routes.js can reuse the same cache instead of hitting
// the football API with a separate raw axios call. (SMELL-2 fix)
const cache = {};

const CACHE_TTL_MS = 60_000; // 60 seconds

function getCached(key) {
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    delete cache[key]; // expired — evict
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache[key] = { data, expiresAt: Date.now() + CACHE_TTL_MS };
}

/**
 * Fetches a URL from football-data.org, using the in-memory cache.
 * Implements a single-flight pattern: if a request for the same URL is already
 * in-flight, subsequent callers wait for the same Promise instead of firing
 * duplicate upstream requests (prevents thundering-herd on cache expiry).
 *
 * Exported for use by scores.routes.js so it shares the same cache.
 */
const inFlight = {};

async function fetchFootballApi(url) {
  // 1. Cache hit — return immediately
  const cached = getCached(url);
  if (cached) return cached;

  // 2. Single-flight: if a request is already in-flight for this URL, wait for it
  if (inFlight[url]) return inFlight[url];

  // 3. Fire the upstream request, store the promise so others can piggyback
  inFlight[url] = axios
    .get(url, {
      headers: { 'X-Auth-Token': process.env.FOOTBALL_API_TOKEN },
      timeout: 10_000,
    })
    .then((response) => {
      setCache(url, response.data);
      return response.data;
    })
    .finally(() => {
      delete inFlight[url]; // remove from in-flight registry once settled
    });

  return inFlight[url];
}

// ─── GET /football/* ──────────────────────────────────────────────────────────
// Proxy pass-through to football-data.org/v4.
// The API token is injected server-side — NEVER exposed to the browser.
// Responses are cached for 60s to respect rate limits.
//
// Example: GET /football/competitions/WC/matches
//   → https://api.football-data.org/v4/competitions/WC/matches
router.get('/*', requireAuth, async (req, res, next) => {
  try {
    // Build the upstream URL — strip the /football prefix, keep path + query
    const upstreamPath = req.path === '/' ? '' : req.path;
    const queryString = new URLSearchParams(req.query).toString();
    const upstreamUrl = `${FOOTBALL_API_BASE}${upstreamPath}${queryString ? '?' + queryString : ''}`;

    const wasCached = !!getCached(upstreamUrl);
    const data = await fetchFootballApi(upstreamUrl);

    res.set('X-Cache', wasCached ? 'HIT' : 'MISS');
    res.json(data);
  } catch (err) {
    // Forward football API error status codes to the client
    if (err.response) {
      const status = err.response.status;
      if (status === 429) {
        return res.status(429).json({ error: 'API rate limit reached. Try again in a minute.' });
      }
      if (status === 403) {
        return res.status(403).json({ error: 'Football API token is invalid.' });
      }
      if (status === 404) {
        return res.status(404).json({ error: 'Football data not found.' });
      }
      return res.status(status).json({ error: `Football API error: ${status}` });
    }
    // Network error — pass to central error handler
    next(err);
  }
});

module.exports = { router, fetchFootballApi };
