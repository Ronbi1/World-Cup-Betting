import { useEffect, useState } from 'react';

// Shared "what time is it, roughly" hook for list pages that render N
// MatchCards. Each card needs a `now` value to compute its countdown, but
// spawning N setIntervals (one per card) wastes timers and re-renders. So
// the parent page calls `useMinuteTick()` once and passes the returned
// epoch-ms down as a prop; all cards re-render together on the same tick.
//
// Implementation notes:
//   - First update is scheduled with `setTimeout` aligned to the next
//     wall-clock minute boundary, so the displayed "Starts in 5m" flips
//     to "4m" at the actual second :00, not at an arbitrary offset.
//   - After the first boundary, a `setInterval(60s)` takes over.
//   - `visibilitychange` re-runs an immediate tick + re-aligns the
//     timer when a tab returns from background, where browsers throttle
//     intervals (so a tab asleep for 10 minutes doesn't show stale text).
//   - Cleans up both timers + the listener on unmount.
//
// Returns: epoch milliseconds (number). Components should treat it as
// opaque and only feed it into `getKickoffCountdown` / `formatKickoffCountdown`.
const MINUTE_MS = 60_000;

export function useMinuteTick() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let intervalId = null;
    let timeoutId = null;

    const tick = () => setNow(Date.now());

    const scheduleAlignedInterval = () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (intervalId !== null) clearInterval(intervalId);

      const msUntilNextMinute = MINUTE_MS - (Date.now() % MINUTE_MS);
      timeoutId = setTimeout(() => {
        tick();
        intervalId = setInterval(tick, MINUTE_MS);
      }, msUntilNextMinute);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tick();
        scheduleAlignedInterval();
      }
    };

    scheduleAlignedInterval();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      if (intervalId !== null) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return now;
}
