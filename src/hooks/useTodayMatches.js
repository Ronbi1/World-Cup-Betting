import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchTodayMatches, parseApiError } from '../services/footballService';
import { MATCH_STATUS } from '../utils/constants';

// worldcup26.ir exposes live status via time_elapsed. Adaptive polling:
//   - 30 s while a match is IN_PLAY / PAUSED
//   - 60 s when kickoff is within 15 minutes
//   - 5 min otherwise (plus visibility-change refetch)
const SLOW_POLL_MS = 5 * 60_000;
const FAST_POLL_MS = 30_000;
const PRE_KICKOFF_POLL_MS = 60_000;
const PRE_KICKOFF_WINDOW_MS = 15 * 60_000;

function getPollInterval(matches) {
  if (!matches?.length) return SLOW_POLL_MS;

  const now = Date.now();
  const hasLive = matches.some(
    (m) => m.status === MATCH_STATUS.IN_PLAY || m.status === MATCH_STATUS.PAUSED,
  );
  if (hasLive) return FAST_POLL_MS;

  const kickoffSoon = matches.some((m) => {
    if (m.status !== MATCH_STATUS.SCHEDULED && m.status !== MATCH_STATUS.TIMED) return false;
    if (!m.utcDate) return false;
    const diff = new Date(m.utcDate).getTime() - now;
    return diff > 0 && diff <= PRE_KICKOFF_WINDOW_MS;
  });
  if (kickoffSoon) return PRE_KICKOFF_POLL_MS;

  return SLOW_POLL_MS;
}

export function useTodayMatches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const cancelledRef = useRef(false);
  const matchesRef = useRef(matches);
  const intervalRef = useRef(null);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const data = await fetchTodayMatches();
      if (!cancelledRef.current) {
        setMatches(data);
        matchesRef.current = data;
        setLastUpdated(new Date());
      }
    } catch (err) {
      if (!cancelledRef.current) setError(parseApiError(err));
    } finally {
      if (isInitial && !cancelledRef.current) setLoading(false);
    }
  }, []);

  const resetPollInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (document.visibilityState !== 'hidden') fetchData(false);
    }, getPollInterval(matchesRef.current));
  }, [fetchData]);

  useEffect(() => {
    cancelledRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(true);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchData(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    resetPollInterval();

    return () => {
      cancelledRef.current = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, resetPollInterval]);

  useEffect(() => {
    matchesRef.current = matches;
    resetPollInterval();
  }, [matches, resetPollInterval]);

  const refresh = useCallback(() => fetchData(false), [fetchData]);

  return { matches, loading, error, lastUpdated, refresh };
}
