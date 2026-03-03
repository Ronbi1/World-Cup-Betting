import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import serverApi from '../services/serverApi';
import { STORAGE_KEYS, ROLES } from '../utils/constants';

// ─── Session helpers (logged-in user stays in localStorage) ───────────────────
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

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(loadSession);
  const [users, setUsers]         = useState([]);
  const [scores, setScores]       = useState([]); // [{ userId, points, correctResults, exactScores }]
  const [loadingUsers, setLoadingUsers] = useState(true);

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
    fetchUsers();
  }, [fetchUsers]);

  // Fetch scores once on mount (when a user is logged in)
  useEffect(() => {
    if (user) fetchScores();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password, rememberMe = false) => {
    try {
      const { data } = await serverApi.post('/auth/login', { email, password });
      const { token, user: userData } = data;

      localStorage.setItem('wc_token', token);

      const sessionUser = {
        id:        userData.id,
        email:     userData.email,
        name:      userData.name,
        role:      userData.role,
        status:    userData.status,
        createdAt: userData.createdAt || userData.created_at,
        bet:       userData.bet,
        scores:    userData.scores,
      };

      setUser(sessionUser);
      if (rememberMe) saveSession(sessionUser);

      if (sessionUser.role === ROLES.ADMIN) {
        fetchUsers(sessionUser);
      } else {
        setLoadingUsers(false);
      }

      // Load leaderboard scores for everyone
      fetchScores();

      return { success: true };
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed. Please try again.';
      return { success: false, error: message };
    }
  }, [fetchUsers, fetchScores]);

  // ── Register ───────────────────────────────────────────────────────────────
  const register = useCallback(async ({ email, password, name, winningTeam, topScorer, topAssist }) => {
    try {
      await serverApi.post('/auth/register', { email, password, name, winningTeam, topScorer, topAssist });
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.error || 'Registration failed. Please try again.';
      return { success: false, error: message };
    }
  }, []);

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    setUsers([]);
    setScores([]);
    saveSession(null);
    localStorage.removeItem('wc_token');
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
      const message = err.response?.data?.error || 'Failed to update user status.';
      return { success: false, error: message };
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
      const message = err.response?.data?.error || 'Failed to delete user.';
      return { success: false, error: message };
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
      const message = err.response?.data?.error || 'Failed to recalculate scores.';
      return { success: false, error: message };
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
      if (localStorage.getItem(STORAGE_KEYS.USER)) saveSession(updatedUser);
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.error || 'Failed to save bet.';
      return { success: false, error: message };
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
  }), [freshUser, users, scores, loadingUsers, login, logout, register, updateUserStatus, deleteUser, updateBet, recalculateScores, fetchScores, fetchUsers]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
