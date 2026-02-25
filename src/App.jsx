import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import AllGamesPage from './pages/AllGamesPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import TopScorersPage from './pages/TopScorersPage';
import Navbar from './components/Navbar';

// ─── Route guard: redirect to /login when not authenticated ──────────────────
function ProtectedRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

// ─── Layout: Navbar + page content ───────────────────────────────────────────
function AppLayout({ children }) {
  return (
    <>
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
