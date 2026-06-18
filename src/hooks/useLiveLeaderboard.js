import { useEffect, useMemo, useRef, useState } from 'react';
import serverApi from '../services/serverApi';
import { calcMatchPoints } from '../utils/scoring';
import { MATCH_STATUS } from '../utils/constants';

// Provisional leaderboard overlay — real base scores + live in-play deltas.
//
// Design goals (per product requirements):
//   • NO per-tick API calls. Predictions LOCK at kickoff, so each live match's
//     predictions are fetched exactly ONCE (when it goes live) via the existing
//     /predictions?matchIds= endpoint, then cached forever. Every subsequent
//     socket score push just recomputes the delta locally — zero network.
//   • NEVER mutates the real `scores`. This returns a SEPARATE display array;
//     the canonical leaderboard is untouched, so it can't corrupt real data.
//     When a match finishes, the base refresh folds it in and its live delta
//     drops out — no double count.
//   • Streak/tournament bonuses are unaffected by in-play matches (by product
//     decision), so the live delta is purely base + result points. We reuse
//     the same calcMatchPoints the real scorer uses, so the math matches.
const isLive = (s) => s === MATCH_STATUS.IN_PLAY || s === MATCH_STATUS.PAUSED;

export function useLiveLeaderboard({ baseScores, matches }) {
  // matchId -> { userId -> { home, away } } ; locked predictions, fetched once.
  const [predsByMatch, setPredsByMatch] = useState({});
  const requestedRef = useRef(new Set());

  const liveMatches = useMemo(
    () =>
      (matches || []).filter(
        (m) => isLive(m.status) && m.score?.fullTime?.home != null,
      ),
    [matches],
  );

  // Fetch predictions once for any newly-live match we haven't cached.
  useEffect(() => {
    const need = liveMatches
      .map((m) => String(m.id))
      .filter((id) => !(id in predsByMatch) && !requestedRef.current.has(id));
    if (need.length === 0) return undefined;
    need.forEach((id) => requestedRef.current.add(id));

    let cancelled = false;
    serverApi
      .get('/predictions', { params: { matchIds: need.join(',') } })
      .then(({ data }) => {
        if (cancelled) return;
        setPredsByMatch((prev) => {
          const next = { ...prev };
          for (const id of need) if (!next[id]) next[id] = {};
          for (const p of data ?? []) {
            const mid = String(p.match_id);
            (next[mid] ||= {})[String(p.user_id)] = { home: p.home, away: p.away };
          }
          return next;
        });
      })
      .catch(() => {
        // Allow a retry on the next live change if this fetch failed.
        need.forEach((id) => requestedRef.current.delete(id));
      });
    return () => { cancelled = true; };
  }, [liveMatches, predsByMatch]);

  // Provisional scores = base + Σ live deltas. Pure, recomputes on every socket
  // push (liveMatches scores change) with no network. Identity when nothing live.
  const scores = useMemo(() => {
    if (!baseScores?.length || liveMatches.length === 0) return baseScores ?? [];
    return baseScores.map((row) => {
      let dPoints = 0;
      let dExact = 0;
      let dCorrect = 0;
      for (const m of liveMatches) {
        // Missing prediction → virtual 0-0, exactly like the server scorer.
        const pred = predsByMatch[String(m.id)]?.[String(row.userId)] ?? { home: 0, away: 0 };
        const r = calcMatchPoints(pred, m);
        dPoints += r.points;
        if (r.exact) dExact += 1;
        else if (r.correct) dCorrect += 1;
      }
      if (!dPoints && !dExact && !dCorrect) return row;
      return {
        ...row,
        points: (row.points ?? 0) + dPoints,
        exactScores: (row.exactScores ?? 0) + dExact,
        correctResults: (row.correctResults ?? 0) + dCorrect,
        provisional: true,
      };
    });
  }, [baseScores, liveMatches, predsByMatch]);

  return { scores, live: liveMatches.length > 0 };
}
