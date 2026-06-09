// Tiny local development server — boots the same Express app that Vercel
// runs in production, on port 3000. Vite proxies /api → http://localhost:3000
// (see vite.config.js). Run with `npm run dev:api` (or `npm run dev:all`
// to start both Vite and this server together).
require('dotenv').config();

const app = require('./_app');

const PORT = Number(process.env.API_PORT || 3000);

app.listen(PORT, () => {
  console.log(`\nWorld Cup API (local) listening on http://localhost:${PORT}`);
  console.log(`  Health:  http://localhost:${PORT}/api/health\n`);
});
