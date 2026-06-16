import axios from 'axios';
import { STORAGE_KEYS } from '../utils/constants';

/**
 * Axios instance for every backend call.
 *
 * Base URL strategy:
 *   • Production (Vercel)   → "/api" (same origin → Vercel serverless function)
 *   • Local dev (vite)      → "/api" (Vite proxies to http://localhost:3000)
 *   • Custom hosting        → set VITE_API_BASE_URL to a full URL.
 *
 * Auth is via HttpOnly wc_session cookie (withCredentials: true).
 */
// Timeout is intentionally longer than the backend upstream timeout
// (api/_lib/football.js — 15 s for worldcup26.ir + auth headroom). A
// shorter client timeout would cause the browser to abort a request the
// server is about to complete — the symptom users saw in production as
// "timeout of 10000ms exceeded". See plan: safe-diagnostics PR.
const serverApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 25_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

serverApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadSession = !!localStorage.getItem(STORAGE_KEYS.USER);
      const url = error.config?.url || '';
      // Anti-loop: /auth/me is the boot validation probe used by
      // AuthContext. If it fails with 401/403, AuthContext does its own
      // cleanup and the React tree renders <Navigate to="/login" />.
      // Triggering window.location.href here would clobber that with a
      // hard reload, restart auth boot, and risk a redirect loop.
      const isAuthMeProbe = url.endsWith('/auth/me') || url.includes('/auth/me?');

      localStorage.removeItem(STORAGE_KEYS.USER);
      if (hadSession && !isAuthMeProbe) {
        window.location.href = '/login?reason=expired';
      }
    }
    return Promise.reject(error);
  }
);

export default serverApi;
