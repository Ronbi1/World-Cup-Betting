import { useState, useEffect } from 'react';
import { fetchMatches, parseApiError } from '../services/footballService';

/**
 * Module-level cache — lives for the entire browser session.
 * Every component that calls useMatches() shares the same fetch result,
 * so navigating between pages never triggers a second API call.
 *
 * Reset only happens on hard-refresh (F5) or when the user closes the tab.
 */
const cache = {
  data: null,       // transformed match array
  error: null,      // last error string
  promise: null,    // in-flight fetch promise (prevents duplicate requests)
};

export function useMatches() {
  const [matches, setMatches] = useState(cache.data ?? []);
  const [loading, setLoading] = useState(cache.data === null);
  const [error, setError] = useState(cache.error);

  useEffect(() => {
    // Already have cached data — nothing to do
    if (cache.data !== null) return;

    let cancelled = false;

    // Reuse an in-flight request if another component already kicked one off
    if (!cache.promise) {
      cache.promise = fetchMatches();
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await cache.promise;
        cache.data = data;
        cache.error = null;
        if (!cancelled) {
          setMatches(data);
        }
      } catch (err) {
        const msg = parseApiError(err);
        cache.error = msg;
        cache.promise = null; // allow retry on next mount
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return { matches, loading, error };
}

/** Call this to manually bust the cache (e.g. after admin enters results) */
export function bustMatchCache() {
  cache.data = null;
  cache.error = null;
  cache.promise = null;
}
