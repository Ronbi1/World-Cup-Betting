/**
 * requireAdmin middleware
 *
 * Must be used AFTER requireAuth (relies on req.user being set).
 * Returns 403 if the authenticated user is not an ADMIN.
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

module.exports = { requireAdmin };
