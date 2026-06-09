// Central error handler for the Vercel-hosted Express app. Sanitizes raw DB
// errors so we never leak schema details to clients.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  console.error('[api error]', {
    path: req.path,
    method: req.method,
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  const isDbError =
    err.message?.includes('supabase') ||
    err.message?.includes('PostgreSQL') ||
    err.message?.includes('PGRST') ||
    err.message?.includes('duplicate key') ||
    err.message?.includes('violates') ||
    err.code?.startsWith?.('23');

  if (isDbError) {
    return res.status(500).json({ error: 'A database error occurred. Please try again.' });
  }

  const status = err.status || err.statusCode || 500;
  const message =
    status < 500
      ? err.message || 'Request error.'
      : process.env.NODE_ENV === 'production'
        ? 'Internal server error.'
        : err.message;

  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
