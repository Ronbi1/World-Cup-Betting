// Local-only dev server. Boots the same Express app that Vercel runs in
// production, on port 3000. Vite proxies /api → http://localhost:3000
// (see vite.config.js). Run with `npm run dev:api` (or `npm run dev:all`
// to start both Vite and this server together).
//
// IMPORTANT: this file lives OUTSIDE the /api/ directory on purpose — Vercel
// auto-deploys every JS file under /api/ as a serverless function, and a
// file that calls `app.listen(...)` would crash a serverless cold-start.
// The .cjs extension forces CommonJS regardless of the project-root
// package.json `"type": "module"`.
require('dotenv').config();
// Load .env.local after .env so local overrides win (matches Vite behavior).
require('dotenv').config({ path: '.env.local', override: true });

const app = require('./api/_app');
const { isSimulationMode } = require('./api/_lib/simulation');

const PORT = Number(process.env.API_PORT || 3000);

app.listen(PORT, () => {
  console.log(`\nWorld Cup API (local) listening on http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/api/health`);
  if (isSimulationMode()) {
    console.log('  ⚠  SIMULATION MODE ON — serving demo data (no Supabase writes)\n');
  } else {
    console.log('');
  }
});
