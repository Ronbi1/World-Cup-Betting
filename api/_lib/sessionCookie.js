// HttpOnly session cookie helpers for JWT auth.
const COOKIE_NAME = 'wc_session';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

function setSessionCookie(res, token, { rememberMe = false } = {}) {
  const opts = { ...cookieOptions() };
  if (rememberMe) {
    opts.maxAge = SEVEN_DAYS_MS;
  }
  res.cookie(COOKIE_NAME, token, opts);
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

module.exports = {
  COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
};
