// Single source of truth for the React AuthContext object + the useAuth hook.
//
// Lives in a plain .js file (no JSX, no component exports) so that Vite's
// React Fast Refresh integration ignores it — the previous setup, where
// AuthContext.jsx exported BOTH a component (AuthProvider) and a hook
// (useAuth), tripped the "Could not Fast Refresh ('useAuth' export is
// incompatible)" invalidation. When that invalidation fires on save, the
// live render tree can briefly hold a stale reference to the Context object
// while a new one is created, which makes useContext(AuthContext) return
// null and crash consumers with `useAuth must be used inside <AuthProvider>`.
//
// IMPORTANT: this module MUST be the only place that calls createContext for
// auth. Both AuthProvider (in AuthContext.jsx) and every useAuth consumer
// import the same AuthContext from here — that's what guarantees the
// Provider and the hook share the exact same context instance.
import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
