// Vercel catch-all: every /api/* request lands here and is delegated to the
// shared Express app. Helper files prefixed with `_` (_app, _lib, _routes,
// _local-dev) are excluded from Vercel's function-build automatically.
module.exports = require('./_app');
