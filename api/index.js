// Single Vercel Serverless Function entry point.
//
// vercel.json rewrites every /api/* URL to /api, which lands here. This
// function exports the shared Express app (defined in _app.js), which
// then routes the request based on `req.url` (Vercel preserves the
// original URL across rewrites).
//
// The leading-underscore filenames in this folder (_app.js, _lib/, _routes/)
// are NOT auto-deployed as their own functions because the rewrite above
// funnels everything to /api anyway, even if Vercel ever decided to expose
// them. This is the documented "Express on Vercel" pattern.
module.exports = require('./_app');
