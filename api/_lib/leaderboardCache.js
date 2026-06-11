// Module-level cache for GET /api/scores leaderboard responses.
//
// GET is strictly read-only — it never writes to the DB. The cache absorbs
// concurrent requests (many users hitting the leaderboard at once) and keeps
// the upstream pressure on Supabase + worldcup26 low. Anything that mutates
// what GET /api/scores would compute (POST /scores/recalculate,
// POST /predictions/admin-edit) must call bust() so the next read recomputes.
//
// Extracted from scores.routes.js so cross-route callers (predictions
// admin-edit) can import bust() without reaching across the router export.

const TTL_MS = 30_000;
let _cache = { data: null, expiresAt: 0 };

function read() {
  if (Date.now() < _cache.expiresAt) return _cache.data;
  return null;
}

function write(data) {
  _cache = { data, expiresAt: Date.now() + TTL_MS };
}

function bust() {
  _cache = { data: null, expiresAt: 0 };
}

module.exports = { read, write, bust, TTL_MS };
