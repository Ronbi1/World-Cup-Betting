import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './context/useAuth';
import { LEGACY_STORAGE_KEYS } from './utils/constants';

// ─── One-time purge of stale pre-backend localStorage keys ───────────────────
// Users who registered before the Express backend was added may have leftover
// data in localStorage under these keys. Clear them once on every app boot.
LEGACY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import AllGamesPage from './pages/AllGamesPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import TopScorersPage from './pages/TopScorersPage';
import RulesPage from './pages/RulesPage';
import Navbar from './components/Navbar';
import SimulationBanner from './components/SimulationBanner';

// ─── Route guard: redirect to /login when not authenticated ──────────────────
// Waits for `authReady` (boot-time /auth/me probe) before deciding so a
// valid logged-in user is never bounced to /login during the initial render.
function ProtectedRoute({ children }) {
  const { user, authReady } = useAuth();
  if (!authReady) {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        style={{
          minHeight: '60vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--clr-text-secondary, #888)',
          fontSize: '0.9rem',
        }}
      >
        …
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

// ─── Layout: Navbar + page content ───────────────────────────────────────────
function AppLayout({ children }) {
  return (
    <>
      <SimulationBanner />
      <Navbar />
      {children}
    </>
  );
}

// ─── Route tree ───────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/login"
        element={user ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/" replace /> : <RegisterPage />}
      />

      {/* Protected routes */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppLayout>
              <HomePage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/games"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AllGamesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <AppLayout>
              <ProfilePage />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AppLayout>
              <AdminPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/scorers"
        element={
          <ProtectedRoute>
            <AppLayout>
              <TopScorersPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/rules"
        element={
          <ProtectedRoute>
            <AppLayout>
              <RulesPage />
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
