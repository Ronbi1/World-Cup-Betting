import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTodayMatches, parseApiError } from '../services/footballService';
import { MATCH_STATUS } from '../utils/constants';

const POLL_INTERVAL_MS = 60_000; // 60 seconds — safe within 10 req/min free limit

const isMatchLive = (status) =>
  status === MATCH_STATUS.IN_PLAY || status === MATCH_STATUS.PAUSED;

const hasLiveMatches = (matches) => matches.some((m) => isMatchLive(m.status));

/**
 * Fetches today's matches and polls every 60 s while any match is live.
 * Pauses polling when the browser tab is hidden to conserve API quota.
 *
 * Returns:
 *   matches       – transformed match array
 *   loading       – true only on the very first fetch
 *   error         – human-readable error string or null
 *   lastUpdated   – Date of the last successful fetch (or null)
 *   refresh       – call this manually to force an immediate re-fetch
 */
export function useTodayMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const intervalRef = useRef(null);
  const cancelledRef = useRef(false);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const data = await fetchTodayMatches();
      if (!cancelledRef.current) {
        setMatches(data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (!cancelledRef.current) setError(parseApiError(err));
    } finally {
      if (isInitial && !cancelledRef.current) setLoading(false);
    }
  }, []);

  // ── Start / stop the polling interval ───────────────────────────────────────
  const startPolling = useCallback(() => {
    if (intervalRef.current) return; // already running
    intervalRef.current = setInterval(() => {
      // Pause when tab is hidden — don't waste API quota
      if (document.visibilityState === 'hidden') return;
      fetchData(false);
    }, POLL_INTERVAL_MS);
  }, [fetchData]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // ── Main effect: initial fetch + reactive polling ────────────────────────────
  useEffect(() => {
    cancelledRef.current = false;

    // Initial load
    fetchData(true).then(() => {
      // After first load, start polling — we'll re-evaluate inside the
      // setMatches update path below by watching the matches state
    });

    // Resume/pause when tab visibility changes
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Re-fetch immediately when user comes back to the tab
        fetchData(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelledRef.current = true;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchData, stopPolling]);

  // ── Reactively start/stop polling based on whether matches are live ──────────
  useEffect(() => {
    if (loading) return; // don't start until first load is done

    if (hasLiveMatches(matches)) {
      startPolling();
    } else {
      // No live matches right now — poll less aggressively (every 5 min)
      // so we catch when the next match kicks off
      stopPolling();
      const slowInterval = setInterval(() => {
        if (document.visibilityState !== 'hidden') fetchData(false);
      }, 5 * 60_000);
      return () => clearInterval(slowInterval);
    }
  }, [matches, loading, startPolling, stopPolling, fetchData]);

  const refresh = useCallback(() => fetchData(false), [fetchData]);

  return { matches, loading, error, lastUpdated, refresh };
}
