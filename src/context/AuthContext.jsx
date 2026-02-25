import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS, ROLES, REG_STATUS } from '../utils/constants';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const loadUsers = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USERS_DB);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const saveUsers = (users) => {
  localStorage.setItem(STORAGE_KEYS.USERS_DB, JSON.stringify(users));
};

const loadSession = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Seed a default admin account on first load
const seedAdmin = () => {
  const users = loadUsers();
  if (users.find((u) => u.role === ROLES.ADMIN)) return;
  users.push({
    id: 'admin-1',
    email: 'admin@worldcup.com',
    password: 'Admin123!',
    name: 'Admin',
    role: ROLES.ADMIN,
    status: REG_STATUS.APPROVED,
    createdAt: new Date().toISOString(),
    bet: { winningTeam: null, topScorer: null },
  });
  saveUsers(users);
};

seedAdmin();

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadSession);
  const [users, setUsers] = useState(loadUsers);

  // Persist users list whenever it changes
  useEffect(() => {
    saveUsers(users);
  }, [users]);

  // ── Login ──────────────────────────────────────────────────────────────────
  const login = useCallback(
    (email, password, rememberMe = false) => {
      const found = users.find(
        (u) => u.email.toLowerCase() === email.toLowerCase() && u.password === password
      );

      if (!found) return { success: false, error: 'Invalid email or password.' };
      if (found.status === REG_STATUS.PENDING)
        return { success: false, error: 'Your account is pending admin approval.' };
      if (found.status === REG_STATUS.REJECTED)
        return { success: false, error: 'Your registration was rejected.' };

      const sessionUser = { ...found };
      delete sessionUser.password; // never keep password in session state

      setUser(sessionUser);

      if (rememberMe) {
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(sessionUser));
      }

      return { success: true };
    },
    [users]
  );

  // ── Register ───────────────────────────────────────────────────────────────
  const register = useCallback(
    ({ email, password, name, winningTeam, topScorer }) => {
      if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
        return { success: false, error: 'An account with this email already exists.' };
      }

      const newUser = {
        id: `user-${Date.now()}`,
        email,
        password,
        name,
        role: ROLES.USER,
        status: REG_STATUS.PENDING, // admin must approve
        createdAt: new Date().toISOString(),
        bet: { winningTeam: winningTeam || null, topScorer: topScorer || null },
      };

      setUsers((prev) => [...prev, newUser]);
      return { success: true };
    },
    [users]
  );

  // ── Logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEYS.USER);
  }, []);

  // ── Admin: approve / reject ────────────────────────────────────────────────
  const updateUserStatus = useCallback((userId, status) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, status } : u))
    );
  }, []);

  // ── Update own bet (only before tournament start) ──────────────────────────
  const updateBet = useCallback(
    (winningTeam, topScorer) => {
      if (!user) return { success: false, error: 'Not logged in.' };

      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, bet: { winningTeam, topScorer } } : u
        )
      );

      const updatedUser = { ...user, bet: { winningTeam, topScorer } };
      setUser(updatedUser);

      // Keep session storage in sync
      if (localStorage.getItem(STORAGE_KEYS.USER)) {
        localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updatedUser));
      }

      return { success: true };
    },
    [user]
  );

  // Expose fresh copy of current user (with latest bet)
  const freshUser = user
    ? users.find((u) => u.id === user.id) || user
    : null;

  const value = {
    user: freshUser,
    users,
    login,
    logout,
    register,
    updateUserStatus,
    updateBet,
    isAdmin: freshUser?.role === ROLES.ADMIN,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
