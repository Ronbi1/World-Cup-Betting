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
 * The JWT token is auto-attached to every request.
 */
const serverApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

serverApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('wc_token');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});

serverApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hadToken = !!localStorage.getItem('wc_token');
      // Only treat 401 as a session expiration when there was actually a
      // token to begin with — unauthenticated calls (login, register) must
      // not redirect-loop back to /login.
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
