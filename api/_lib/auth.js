// JWT auth middleware shared by every protected route.
const jwt = require('jsonwebtoken');
const { COOKIE_NAME } = require('./sessionCookie');
const { supabase } = require('./supabase');

function extractToken(req) {
  const cookieToken = req.cookies?.[COOKIE_NAME];
  if (cookieToken) return cookieToken;

  const header = req.headers['authorization'];
  if (header && header.startsWith('Bearer ')) {
    return header.split(' ')[1] || null;
  }

  return null;
}

// Soft decode for GET /auth/me session probe — returns null on missing/invalid token.
function decodeToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      status: decoded.status,
    };
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      status: decoded.status,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Please log in again.' });
    }
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

// Stronger admin gate that re-fetches role + status from Supabase on every
// call. Closes the JWT-staleness gap: a demoted admin still holds a cookie
// claiming role=ADMIN for up to 7 days, so requireAdmin alone would let
// them through. Mount this AFTER requireAuth + requireAdmin on any
// admin-only mutation:
//
//   router.patch('/foo', requireAuth, requireAdmin, requireFreshAdmin, handler);
//
// One DB read per admin write — admin writes are low volume, so the cost
// is negligible compared to the safety win.
async function requireFreshAdmin(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    const { data, error } = await supabase
      .from('users')
      .select('role, status')
      .eq('id', req.user.id)
      .single();
    if (error || !data) {
      return res.status(401).json({ error: 'Session invalid.' });
    }
    if (data.role !== 'ADMIN' || data.status !== 'APPROVED') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, requireAdmin, requireFreshAdmin, extractToken, decodeToken };
