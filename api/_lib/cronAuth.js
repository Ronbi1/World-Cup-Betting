// Auth gate for /api/cron/* endpoints.
//
// Accepts EITHER:
//   * Authorization: Bearer ${CRON_SECRET}  — Vercel Cron-supplied header.
//   * A signed-in admin session (validates via the existing requireAuth +
//     requireAdmin + requireFreshAdmin chain).
//
// This lets the Vercel Cron scheduler hit the endpoint on its own and lets
// an admin manually trigger a refresh from a curl with their session cookie.
//
// CRON_SECRET MUST be set in Vercel env vars. Without it, only the
// admin-session path works (cron requests will 401).

const { requireAuth, requireAdmin, requireFreshAdmin } = require('./auth');

function requireCronAuth(req, res, next) {
  const header = req.headers['authorization'];
  const expected = process.env.CRON_SECRET;
  if (expected && header && header === `Bearer ${expected}`) {
    return next();
  }
  // Fall through to the admin-session chain.
  requireAuth(req, res, (authErr) => {
    if (authErr) return next(authErr);
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    requireAdmin(req, res, (adminErr) => {
      if (adminErr) return next(adminErr);
      requireFreshAdmin(req, res, next);
    });
  });
}

module.exports = { requireCronAuth };
