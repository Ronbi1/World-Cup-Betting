import { useState, useEffect, useCallback, useRef } from 'react';
import serverApi from '../services/serverApi';

export function useSpotlight() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cancelledRef = useRef(false);

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const res = await serverApi.get('/spotlight');
      if (!cancelledRef.current) {
        setData(res.data);
        setError(null);
      }
    } catch (err) {
      if (!cancelledRef.current) {
        setError(err.response?.data?.error || err.message || 'Failed to load spotlight');
      }
    } finally {
      if (isInitial && !cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData(true);
    return () => {
      cancelledRef.current = true;
    };
  }, [fetchData]);

  const refresh = useCallback(() => fetchData(false), [fetchData]);

  return { data, loading, error, refresh };
}
