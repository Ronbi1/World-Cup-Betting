/**
 * Pull a human-readable string out of any error shape we might see.
 *
 * Three shapes need to be handled:
 *   1. Our own backend (api/_lib/errorHandler.js) returns `{ error: "string" }`.
 *   2. Vercel's edge layer returns `{ error: { code, message } }` for
 *      platform-level errors like 404s when no function is matched.
 *   3. Network failures or HTML responses leave `err.response` undefined
 *      (or `err.response.data` as a string).
 *
 * Always returns a string — never an object — so it is safe to drop into
 * React state and render directly.
 */
export function extractApiError(err, fallback = 'Something went wrong. Please try again.') {
  if (typeof err === 'string') return err;

  const data = err?.response?.data;

  // Shape 1: { error: "string" } from our own Express handler.
  if (data && typeof data.error === 'string') return data.error;

  // Shape 2: { error: { code, message } } from Vercel's platform.
  if (data && data.error && typeof data.error.message === 'string') return data.error.message;

  // Shape: { message: "string" } at the top level.
  if (data && typeof data.message === 'string') return data.message;

  // Plain string body (HTML 404, plaintext, etc.) — don't leak it as the UI
  // copy; fall through to the human fallback.
  if (typeof data === 'string' && data.length > 0 && data.length < 200 && !data.startsWith('<')) {
    return data;
  }

  if (typeof err?.message === 'string' && err.message) return err.message;

  return fallback;
}
