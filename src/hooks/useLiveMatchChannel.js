import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { notifications } from '@mantine/notifications';
import { supabase, isRealtimeEnabled } from '../services/supabaseClient';
import { MATCH_STATUS } from '../utils/constants';

// Subscribes to matches_mirror UPDATEs over Supabase Realtime. Two jobs:
//   1. Push the fresh match row up to the caller (onMatch) for instant UI.
//   2. Diff against the last-seen state to fire a toast on every new goal
//      and new yellow/red card.
//
// Additive + safe: if Realtime isn't configured (no env), this is a no-op and
// the existing polling keeps the UI live. First sighting of a match seeds the
// baseline silently — we only toast on subsequent deltas, never on load.
const isLive = (s) => s === MATCH_STATUS.IN_PLAY || s === MATCH_STATUS.PAUSED;

export function useLiveMatchChannel({ onMatch } = {}) {
  const { t } = useTranslation();
  // Whether the realtime socket is actually subscribed. Lets callers hide
  // poll-era UI (refresh button / "updated Xs ago") while pushes are live, and
  // show it when we've fallen back to polling.
  const [connected, setConnected] = useState(false);
  const seenRef = useRef(new Map()); // matchId -> { home, away, eventIds:Set }
  const onMatchRef = useRef(onMatch);
  const tRef = useRef(t);
  useEffect(() => { onMatchRef.current = onMatch; }, [onMatch]);
  useEffect(() => { tRef.current = t; }, [t]);

  useEffect(() => {
    if (!isRealtimeEnabled) return undefined;

    const handle = (m) => {
      if (!m?.id) return;
      const id = String(m.id);
      const home = m.score?.fullTime?.home ?? m.score?.home ?? 0;
      const away = m.score?.fullTime?.away ?? m.score?.away ?? 0;
      const events = Array.isArray(m.events) ? m.events : [];
      const prev = seenRef.current.get(id);

      // Seed silently the first time we see a match (avoid load-time spam).
      if (prev) {
        const tr = tRef.current;
        const teams = `${m.homeTeam?.shortName ?? m.homeTeam?.name ?? '?'} ${home}–${away} ${m.awayTeam?.shortName ?? m.awayTeam?.name ?? '?'}`;

        if (isLive(m.status) && (home > prev.home || away > prev.away)) {
          const scorer = [...events].reverse().find((e) => e.kind === 'goal');
          const who = scorer?.players?.[0];
          notifications.show({
            color: 'teal',
            title: `⚽ ${tr('liveToast.goal')}`,
            message: who ? `${who} ${scorer.clock ?? ''} · ${teams}` : teams,
            autoClose: 8000,
          });
        }

        for (const e of events) {
          if (prev.eventIds.has(e.id)) continue;
          if (e.kind === 'yellow' || e.kind === 'red') {
            const who = e.players?.[0] ? `${e.players[0]} ` : '';
            notifications.show({
              color: e.kind === 'red' ? 'red' : 'yellow',
              title: e.kind === 'red' ? `🟥 ${tr('liveToast.red')}` : `🟨 ${tr('liveToast.yellow')}`,
              message: `${who}${e.team ? `(${e.team}) ` : ''}${e.clock ?? ''} · ${teams}`,
              autoClose: 7000,
            });
          }
        }
      }

      seenRef.current.set(id, { home, away, eventIds: new Set(events.map((e) => e.id)) });
      if (onMatchRef.current) onMatchRef.current(m);
    };

    const channel = supabase
      .channel('matches_mirror_live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches_mirror' },
        (payload) => handle(payload.new?.normalized),
      )
      .subscribe((status) => setConnected(status === 'SUBSCRIBED'));

    return () => { setConnected(false); supabase.removeChannel(channel); };
  }, []);

  return { connected };
}
