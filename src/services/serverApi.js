import axios from 'axios';
import { STORAGE_KEYS } from '../utils/constants';

/**
 * Axios instance for all calls to the Express backend.
 * Base URL is proxied by Vite in dev (/server → http://localhost:5000).
 * The JWT token is automatically attached to every request.
 */
const serverApi = axios.create({
  baseURL: import.meta.env.VITE_SERVER_BASE_URL || '/server',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Request interceptor: attach JWT ─────────────────────────────────────────
serverApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('wc_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: handle expired / invalid token ────────────────────
serverApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadToken = !!localStorage.getItem('wc_token');
      // Only treat as "session expired" when there was actually a token.
      // Without this guard, unauthenticated calls (login, register) would
      // also trigger a redirect loop with the "session expired" banner.
      localStorage.removeItem('wc_token');
      localStorage.removeItem(STORAGE_KEYS.USER);
      if (hadToken) {
        window.location.href = '/login?reason=expired';
      }
    }
    return Promise.reject(error);
  }
);

export default serverApi;
