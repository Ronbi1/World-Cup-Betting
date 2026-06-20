import {
  useCallback, useEffect, useRef, useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, isRealtimeEnabled } from '../services/supabaseClient';
import { MATCH_STATUS } from '../utils/constants';
import { LiveEventsContext } from './useLiveEvents';

// One app-wide owner of the matches_mirror Realtime subscription. It does three
// things on every UPDATE push:
//   1. Diff vs last-seen state and surface new goals / yellow / red cards as
//      header toasts that linger for TOAST_TTL_MS (2 min).
//   2. Fire a browser (OS-level) Notification for the same events — useful when
//      the tab is backgrounded.
//   3. Fan the raw match row out to any registered onMatch handlers (HomePage's
//      live overlay subscribes through useLiveMatchChannel).
//
// Mounted ABOVE the router so the single subscription survives navigation — the
// header toasts and OS notifications work on every page, not just Home.
//
// Additive + safe: if Realtime isn't configured this is inert and the existing
// polling keeps the UI live. First sighting of a match seeds the baseline
// silently — we only alert on subsequent deltas, never on load.

const TOAST_TTL_MS = 2 * 60_000; // header toasts persist 2 minutes after an event
const PRUNE_MS = 5_000; // how often we sweep expired toasts
const MAX_VISIBLE = 6; // cap stacked header toasts
const NOTIF_ICON = '/pwa-192.png';

const isLive = (s) => s === MATCH_STATUS.IN_PLAY || s === MATCH_STATUS.PAUSED;
const notifPerm = () => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');

export function LiveEventsProvider({ children }) {
  const { t } = useTranslation();
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]); // { id, kind, color, title, message, ts }
  const [permission, setPermission] = useState(notifPerm);

  const seenRef = useRef(new Map()); // matchId -> { home, away, eventIds:Set }
  const subsRef = useRef(new Set()); // onMatch callbacks (HomePage etc.)
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);

  // Let a consumer (the ticker's bell) explicitly ask for OS-notification
  // permission from a user gesture — the reliable way across browsers.
  const requestNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      return p;
    } catch {
      return notifPerm();
    }
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((cur) => cur.filter((x) => x.id !== id));
  }, []);

  const registerMatchHandler = useCallback((cb) => {
    subsRef.current.add(cb);
    return () => { subsRef.current.delete(cb); };
  }, []);

  // Surface one event: add a header toast and (best-effort) an OS notification.
  // The OS notification only fires when the tab is hidden — when the user is
  // looking at the page the header toast already covers it.
  const emit = useCallback((evt, { force = false } = {}) => {
    setToasts((cur) => {
      if (cur.some((x) => x.id === evt.id)) return cur; // de-dupe re-pushes
      return [...cur, evt].slice(-MAX_VISIBLE);
    });
    // `force` (admin test) fires the OS notification even when the tab is
    // focused, so the admin can verify it without backgrounding the page.
    if (notifPerm() === 'granted' && (force || document.visibilityState === 'hidden')) {
      try {
        new Notification(evt.title, { body: evt.message, tag: evt.id, icon: NOTIF_ICON });
      } catch { /* OS notification is best-effort */ }
    }
  }, []);

  // Admin/dev hook: push an arbitrary free-text event through the exact same
  // path real goal/card events take (header toast + OS notification). Local to
  // this browser — it does not broadcast to other users.
  const sendTestEvent = useCallback((text) => {
    const message = String(text || '').trim() || 'Test notification';
    emit({
      id: `test-${Date.now()}`,
      kind: 'goal',
      color: 'teal',
      title: `🔔 ${tRef.current('liveToast.test')}`,
      message,
      ts: Date.now(),
    }, { force: true });
  }, [emit]);

  // Sweep expired header toasts. Returns the same array ref when nothing changed
  // so we don't re-render every 5 s for no reason.
  useEffect(() => {
    const iv = setInterval(() => {
      const cutoff = Date.now() - TOAST_TTL_MS;
      setToasts((cur) => {
        const next = cur.filter((x) => x.ts >= cutoff);
        return next.length === cur.length ? cur : next;
      });
    }, PRUNE_MS);
    return () => clearInterval(iv);
  }, []);

  // The single Realtime subscription + diff.
  useEffect(() => {
    if (!isRealtimeEnabled) return undefined;

    const handle = (m) => {
      if (!m?.id) return;
      const id = String(m.id);
      const home = m.score?.fullTime?.home ?? m.score?.home ?? 0;
      const away = m.score?.fullTime?.away ?? m.score?.away ?? 0;
      const events = Array.isArray(m.events) ? m.events : [];
      const prev = seenRef.current.get(id);

      if (prev) {
        const tr = tRef.current;
        const teams = `${m.homeTeam?.shortName ?? m.homeTeam?.name ?? '?'} ${home}–${away} ${m.awayTeam?.shortName ?? m.awayTeam?.name ?? '?'}`;

        if (isLive(m.status) && (home > prev.home || away > prev.away)) {
          const scorer = [...events].reverse().find((e) => e.kind === 'goal');
          const who = scorer?.players?.[0];
          emit({
            id: `goal-${id}-${home}-${away}`,
            kind: 'goal',
            color: 'teal',
            title: `⚽ ${tr('liveToast.goal')}`,
            message: who ? `${who} ${scorer?.clock ?? ''} · ${teams}` : teams,
            ts: Date.now(),
          });
        }

        for (const e of events) {
          if (prev.eventIds.has(e.id)) continue;
          if (e.kind === 'yellow' || e.kind === 'red') {
            const who = e.players?.[0] ? `${e.players[0]} ` : '';
            emit({
              id: `card-${e.id}`,
              kind: e.kind,
              color: e.kind === 'red' ? 'red' : 'yellow',
              title: e.kind === 'red' ? `🟥 ${tr('liveToast.red')}` : `🟨 ${tr('liveToast.yellow')}`,
              message: `${who}${e.team ? `(${e.team}) ` : ''}${e.clock ?? ''} · ${teams}`,
              ts: Date.now(),
            });
          }
        }
      }

      seenRef.current.set(id, { home, away, eventIds: new Set(events.map((e) => e.id)) });
      subsRef.current.forEach((cb) => { try { cb(m); } catch { /* handler isolation */ } });
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
  }, [emit]);

  const value = {
    connected,
    toasts,
    dismissToast,
    registerMatchHandler,
    permission,
    requestNotifications,
    sendTestEvent,
  };

  return <LiveEventsContext.Provider value={value}>{children}</LiveEventsContext.Provider>;
}
