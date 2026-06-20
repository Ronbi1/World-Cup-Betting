import { useEffect, useRef } from 'react';
import { useLiveEvents } from '../context/useLiveEvents';

// Thin adapter over LiveEventsProvider: registers an onMatch handler against the
// app-wide Realtime subscription and reports whether the socket is connected.
//
// The subscription, goal/card diffing, header toasts and OS notifications all
// live in the provider now — this just lets a page (HomePage) receive the raw
// match row for its live overlay without owning a second subscription.
export function useLiveMatchChannel({ onMatch } = {}) {
  const { connected, registerMatchHandler } = useLiveEvents();
  const cbRef = useRef(onMatch);
  useEffect(() => { cbRef.current = onMatch; }, [onMatch]);

  // registerMatchHandler is stable, so this runs once. The wrapper reads the
  // latest onMatch from a ref so callers needn't memoize it.
  useEffect(
    () => registerMatchHandler((m) => cbRef.current?.(m)),
    [registerMatchHandler],
  );

  return { connected };
}
