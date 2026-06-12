// 30 s cache for GET /api/spotlight — pairs with the scores cache TTL.

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
