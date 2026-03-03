const jwt = require('jsonwebtoken');
require('dotenv').config();

/**
 * requireAuth middleware
 *
 * Verifies the Bearer JWT in the Authorization header.
 * On success, attaches the decoded payload to req.user:
 *   { id, email, name, role, status, iat, exp }
 *
 * JWT payload is intentionally minimal — only what the server needs
 * for authorization decisions. Sensitive data (password, bet) is not included.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Malformed token.' });
  }

  try {
    // Verify signature and expiry. Throws if invalid or expired.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Only attach the fields we care about — do not leak internal JWT fields
    req.user = {
      id:     decoded.id,
      email:  decoded.email,
      name:   decoded.name,
      role:   decoded.role,
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
    // Unexpected JWT error — pass to central error handler
    next(err);
  }
}

module.exports = { requireAuth };
