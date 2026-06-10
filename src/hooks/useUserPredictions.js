import { useState, useEffect, useCallback } from 'react';
import serverApi from '../services/serverApi';

/**
 * Module-level cache keyed by userId — lives for the browser session.
 * HomePage and AllGamesPage share the same fetch result so navigating
 * between pages never triggers a second API call.
 */
const cacheByUser = new Map();

function rowsToMap(rows) {
  const map = {};
  rows.forEach((row) => {
    map[row.match_id] = { home: row.home, away: row.away };
  });
  return map;
}

function getUserCache(userId) {
  if (!cacheByUser.has(userId)) {
    cacheByUser.set(userId, { data: null, promise: null });
  }
  return cacheByUser.get(userId);
}

export function useUserPredictions(userId) {
  const userCache = userId ? getUserCache(userId) : null;
  const [predictions, setPredictions] = useState(userCache?.data ?? {});
  const [loading, setLoading] = useState(Boolean(userId) && userCache?.data === null);

  const upsertPrediction = useCallback((matchId, pred) => {
    if (!userId) return;
    const cache = getUserCache(userId);
    const next = { ...(cache.data ?? {}), [String(matchId)]: pred };
    cache.data = next;
    setPredictions(next);
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const cache = getUserCache(userId);
    cache.data = null;
    cache.promise = null;
    setLoading(true);
    try {
      const { data } = await serverApi.get('/predictions', { params: { userId } });
      const map = rowsToMap(data ?? []);
      cache.data = map;
      setPredictions(map);
    } catch (err) {
      console.error('[useUserPredictions] refresh error:', err.message);
      cache.promise = null;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setPredictions({});
      setLoading(false);
      return undefined;
    }

    const cache = getUserCache(userId);

    if (cache.data !== null) {
      setPredictions(cache.data);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    if (!cache.promise) {
      cache.promise = serverApi.get('/predictions', { params: { userId } });
    }

    const load = async () => {
      setLoading(true);
      try {
        const { data } = await cache.promise;
        const map = rowsToMap(data ?? []);
        cache.data = map;
        if (!cancelled) {
          setPredictions(map);
        }
      } catch (err) {
        console.error('[useUserPredictions] fetch error:', err.message);
        cache.promise = null;
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [userId]);

  return { predictions, loading, upsertPrediction, refresh };
}
