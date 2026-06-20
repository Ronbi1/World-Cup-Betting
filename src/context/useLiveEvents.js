// Single source of truth for the LiveEvents context object + the useLiveEvents
// hook. Lives in a plain .js file (no JSX, no component exports) so Vite's React
// Fast Refresh ignores it — mirroring the AuthContext / useAuth split, which
// avoids the "export is incompatible" invalidation that can transiently make
// useContext return null. LiveEventsProvider (in LiveEventsContext.jsx) and every
// consumer import the same context instance from here.
import { createContext, useContext } from 'react';

export const LiveEventsContext = createContext(null);

export const useLiveEvents = () => {
  const ctx = useContext(LiveEventsContext);
  if (!ctx) throw new Error('useLiveEvents must be used within <LiveEventsProvider>');
  return ctx;
};
