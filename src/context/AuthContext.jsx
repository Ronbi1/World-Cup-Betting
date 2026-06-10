import { useState, useEffect, useCallback, useMemo } from 'react';
import serverApi from '../services/serverApi';
import { STORAGE_KEYS, ROLES } from '../utils/constants';
import { extractApiError } from '../utils/apiErrors';
// The Context object + useAuth hook live in ./useAuth.js. AuthProvider stays
// in this .jsx file as the sole export so Vite React Fast Refresh can
// hot-reload it cleanly (mixing component + hook exports in the same module
// breaks Fast Refresh and intermittently crashes consumers with
// "useAuth must be used inside <AuthProvider>").
import { AuthContext } from './useAuth';

// ─── Session helpers (wc_user is a non-sensitive UI cache only) ─────────────
// The JWT lives in the HttpOnly wc_session cookie. wc_user hydrates the UI
// instantly on refresh while /auth/me validates the cookie in the background.
const loadSession = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const saveSession = (user) => {
  if (user) localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  else localStorage.removeItem(STORAGE_KEYS.USER);
};

const sessionFromServer = (userData) => ({
  id:        userData.id,
  email:     userData.email,
  name:      userData.name,
  role:      userData.role,
  status:    userData.status,
  createdAt: userData.createdAt || userData.created_at,
  bet:       userData.bet,
  scores:    userData.scores,
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user, setUser]           = useState(loadSession);
  const [users, setUsers]         = useState([]);
  const [scores, setScores]       = useState([]); // [{ userId, points, correctResults, exactScores }]
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Always false on boot — /auth/me must run once to validate the cookie.
  // ProtectedRoute waits for authReady so a valid logged-in user is never
  // bounced to /login mid-boot.
  const [authReady, setAuthReady] = useState(false);

  // ── Boot: validate HttpOnly cookie via /api/auth/me ───────────────────────
  // StrictMode-safe: the `cancelled` flag + cleanup is the sole de-dup
  // mechanism. A previous version also used a useRef guard to short-circuit
  // the second mount, but that combined with StrictMode's
  // mount → cleanup → mount cycle left the first probe in a "cancelled"
  // state while the second mount early-returned, so `setAuthReady(true)`
  // never ran and the app froze on the ProtectedRoute loader. Without the
  // ref, mount #1's probe is cancelled by its cleanup and mount #2's probe
  // completes normally. In production StrictMode does not double-invoke
  // effects, so only one /auth/me request is made.
  //
  // Failure modes:
  //   • 401 / 403 → cookie invalid or user no longer APPROVED. Clear cache
  //     and let the React render redirect to /login naturally.
  //   • Network / 5xx → keep cached wc_user, surface a console warning, mark
  //     auth ready so the app is usable; next real API call will surface
  //     any real auth issue through the normal interceptor path.
  useEffect(() => {
    // Legacy: purge pre-cookie JWT from localStorage (one-time re-login).
    localStorage.removeItem('wc_token');

    let cancelled = false;
    (async () => {
      try {
        // /auth/me always returns 200: { user } when logged in, { user: null }
        // when not. Avoids browser 401 console noise on every cold boot.
        const { data } = await serverApi.get('/auth/me');
        if (cancelled) return;
        if (data.user) {
          const fresh = sessionFromServer(data.user);
          setUser(fresh);
          saveSession(fresh);
        } else {
          saveSession(null);
          setUser(null);
        }
      } catch (err) {
        if (cancelled) return;
        console.warn('[AuthContext] /auth/me probe failed:', err?.message);
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Load all users from Express — admin only ───────────────────────────────
  const fetchUsers = useCallback(async (currentUser) => {
    const u = currentUser ?? user;
    if (!u || u.role !== ROLES.ADMIN) {
      setLoadingUsers(false);
      return;
    }
    try {
      const { data } = await serverApi.get('/users');
      setUsers(data);
    } catch (err) {
      console.error('[AuthContext] fetchUsers error:', err.message);
    } finally {
      setLoadingUsers(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role]);

  // ── Load scores for all approved users (available to everyone) ────────────
  const fetchScores = useCallback(async () => {
    try {
      const { data } = await serverApi.get('/scores');
      setScores(data);
    } catch (err) {
      console.error('[AuthContext] fetchScores error:', err.message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUsers();
  }, [fetchUsers]);

  // Fetch scores once on mount (when a user is logged in)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user) fetchScores();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password, rememberMe = false) => {
    try {
      const { data } = await serverApi.post('/auth/login', { email, password, rememberMe });
      const sessionUser = sessionFromServer(data.user);

      setUser(sessionUser);
      saveSession(sessionUser);
      setAuthReady(true);

      if (sessionUser.role === ROLES.ADMIN) {
        fetchUsers(sessionUser);
      } else {
        setLoadingUsers(false);
      }

      fetchScores();

      return { success: true };
    } catch (err) {
      return { success: false, error: extractApiError(err, 'Login failed. Please try again.') };
    }
  }, [fetchUsers, fetchScores]);

  // ── Register ───────────────────────────────────────────────────────────────
  const register = useCallback(async ({ email, password, name, winningTeam, topScorer, topAssist }) => {
    try {
      await serverApi.post('/auth/register', { email, password, name, winningTeam, topScorer, topAssist });
      return { success: true };
    } catch (err) {
      return { success: false, error: extractApiError(err, 'Registration failed. Please try again.') };
    }
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try {
      await serverApi.post('/auth/logout');
    } catch (err) {
      console.warn('[AuthContext] logout request failed:', err?.message);
    }
    setUser(null);
    setUsers([]);
    setScores([]);
    saveSession(null);
  }, []);

  // ── Admin: approve / reject ────────────────────────────────────────────────
  // SMELL-6 fix: return { success, error } so callers know if the update failed
  // instead of silently swallowing errors while the UI shows the wrong status.
  const updateUserStatus = useCallback(async (userId, status) => {
    try {
      await serverApi.patch(`/users/${userId}/status`, { status });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, status } : u));
      return { success: true };
    } catch (err) {
      console.error('[AuthContext] updateUserStatus error:', err.message);
      return { success: false, error: extractApiError(err, 'Failed to update user status.') };
    }
  }, []);

  // ── Admin: delete a user ──────────────────────────────────────────────────
  const deleteUser = useCallback(async (userId) => {
    try {
      await serverApi.delete(`/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      setScores(prev => prev.filter(s => s.userId !== userId));
      return { success: true };
    } catch (err) {
      return { success: false, error: extractApiError(err, 'Failed to delete user.') };
    }
  }, []);

  // ── Admin: recalculate all scores ─────────────────────────────────────────
  // CRIT-3: handles HTTP 207 Multi-Status (partial DB write failure) gracefully —
  // still refreshes the leaderboard and surfaces a warning to the caller.
  const recalculateScores = useCallback(async (tournamentBets = {}) => {
    try {
      const { data } = await serverApi.post('/scores/recalculate', tournamentBets);
      // Always refresh scores from DB regardless of partial success
      await fetchScores();
      // If the server returned a warning (207), propagate it so the UI can show it
      if (data?.warning) {
        return { success: true, warning: data.warning };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: extractApiError(err, 'Failed to recalculate scores.') };
    }
  }, [fetchScores]);

  // ── Update own tournament bet ──────────────────────────────────────────────
  const updateBet = useCallback(async (winningTeam, topScorer, topAssist) => {
    if (!user) return { success: false, error: 'Not logged in.' };
    try {
      const { data } = await serverApi.patch(`/users/${user.id}/bet`, { winningTeam, topScorer, topAssist });
      const updatedUser = { ...user, bet: data.bet };
      setUser(updatedUser);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, bet: data.bet } : u));
      saveSession(updatedUser);
      return { success: true };
    } catch (err) {
      return { success: false, error: extractApiError(err, 'Failed to save bet.') };
    }
  }, [user]);

  // ── Memoized fresh user (synced with users list) ───────────────────────────
  const freshUser = useMemo(
    () => user ? (users.find(u => u.id === user.id) || user) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, user?.status, user?.bet, users]
  );

  const value = useMemo(() => ({
    user: freshUser,
    users,
    scores,
    loadingUsers,
    authReady,
    login,
    logout,
    register,
    updateUserStatus,
    deleteUser,
    updateBet,
    recalculateScores,
    refreshScores: fetchScores,
    isAdmin: freshUser?.role === ROLES.ADMIN,
    refreshUsers: fetchUsers,
  }), [freshUser, users, scores, loadingUsers, authReady, login, logout, register, updateUserStatus, deleteUser, updateBet, recalculateScores, fetchScores, fetchUsers]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
