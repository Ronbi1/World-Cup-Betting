import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchMatches, parseApiError } from '../services/footballService';
import { MATCH_STATUS } from '../utils/constants';

// Powers the HomePage "next 15 hours" + "recently finished" sections.
// We fetch the full season list (not just today/UTC) because the HomePage
// windows it on the client by Israel-local time, and any "next 15 h"
// evening window straddles UTC midnight — a UTC-day-bounded fetch would
// silently hide tomorrow-morning kickoffs. The /matches endpoint hits the
// same backend cache as /matches/today so the cost is identical.
//
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

// useHomeMatches({ onMatchFinished }) — optional callback fires when any
// match in the polled set transitions into FINISHED. HomePage uses this to
// kick off an immediate leaderboard refresh so users see their points within
// ~1 minute of the real-world final whistle.
export function useHomeMatches({ onMatchFinished } = {}) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const cancelledRef = useRef(false);
  const matchesRef = useRef(matches);
  const intervalRef = useRef(null);
  const prevFinishedIdsRef = useRef(new Set());
  const onMatchFinishedRef = useRef(onMatchFinished);

  useEffect(() => {
    onMatchFinishedRef.current = onMatchFinished;
  }, [onMatchFinished]);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError(null);
    try {
      const data = await fetchMatches();
      if (!cancelledRef.current) {
        // Detect FINISHED transitions before we overwrite matchesRef.
        const nextFinished = new Set(
          (data ?? [])
            .filter((m) => m.status === MATCH_STATUS.FINISHED)
            .map((m) => String(m.id)),
        );
        const justFinished = [];
        for (const id of nextFinished) {
          if (!prevFinishedIdsRef.current.has(id)) justFinished.push(id);
        }
        prevFinishedIdsRef.current = nextFinished;

        setMatches(data);
        matchesRef.current = data;
        setLastUpdated(new Date());

        if (justFinished.length > 0 && typeof onMatchFinishedRef.current === 'function') {
          // Fire after state commit; defer to next tick so subscribers run
          // against the freshly committed match list.
          Promise.resolve().then(() => {
            try { onMatchFinishedRef.current(justFinished); } catch { /* swallow */ }
          });
        }
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

  // Merge a single match pushed over Supabase Realtime into the current set,
  // so a live goal/card reflects instantly without waiting for the next poll.
  // Only touches matches already in the polled list; unknown ids are ignored.
  const applyLiveUpdate = useCallback((row) => {
    if (!row?.id) return;
    setMatches((prev) => {
      const idx = prev.findIndex((m) => String(m.id) === String(row.id));
      if (idx === -1) return prev;
      const nextArr = prev.slice();
      nextArr[idx] = { ...nextArr[idx], ...row };
      matchesRef.current = nextArr;
      return nextArr;
    });
    setLastUpdated(new Date());
  }, []);

  return { matches, loading, error, lastUpdated, refresh, applyLiveUpdate };
}
