/**
 * Central Express error handler.
 *
 * Catches all errors passed via next(err) from route handlers.
 * Sanitizes raw Supabase/DB errors so internal table structures
 * and column names are never leaked to the client.
 *
 * Must be registered LAST in index.js (after all routes).
 */
function errorHandler(err, req, res, _next) {
  // Log the full error server-side for debugging
  console.error('[Server Error]', {
    path: req.path,
    method: req.method,
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  // Detect Supabase / PostgreSQL raw errors by common signatures
  const isDbError =
    err.message?.includes('supabase') ||
    err.message?.includes('PostgreSQL') ||
    err.message?.includes('PGRST') ||       // PostgREST error codes
    err.message?.includes('duplicate key') ||
    err.message?.includes('violates') ||
    err.code?.startsWith('23');             // PostgreSQL constraint error codes

  if (isDbError) {
    return res.status(500).json({ error: 'A database error occurred. Please try again.' });
  }

  // Use the error's own status code if set (e.g. from route handlers)
  const status = err.status || err.statusCode || 500;

  // For 4xx errors, pass the message through (it's intentional and safe)
  // For 5xx errors, use a generic message in production
  const message =
    status < 500
      ? (err.message || 'Request error.')
      : (process.env.NODE_ENV === 'production' ? 'Internal server error.' : err.message);

  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
