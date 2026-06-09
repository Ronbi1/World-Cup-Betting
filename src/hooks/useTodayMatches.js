import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTodayMatches, parseApiError } from '../services/footballService';

// TheSportsDB free tier doesn't expose in-play status, so we don't need
// aggressive polling. We:
//   - fetch on mount
//   - refetch when the user comes back to the tab (catches "match just
//     finished" without burning quota while the tab is hidden)
//   - poll slowly every 5 minutes as a safety net to catch status flips
//   - expose a manual refresh() the UI can wire to a button
const SLOW_POLL_MS = 5 * 60_000;

export function useTodayMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

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

  useEffect(() => {
    cancelledRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(true);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchData(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const slow = setInterval(() => {
      if (document.visibilityState !== 'hidden') fetchData(false);
    }, SLOW_POLL_MS);

    return () => {
      cancelledRef.current = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(slow);
    };
  }, [fetchData]);

  const refresh = useCallback(() => fetchData(false), [fetchData]);

  return { matches, loading, error, lastUpdated, refresh };
}
