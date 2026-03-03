// ─── Competition ─────────────────────────────────────────────────────────────
export const COMPETITION_CODE = 'WC';

// ─── Tournament dates ────────────────────────────────────────────────────────
// World Cup 2026: June 11 – July 19, 2026
export const TOURNAMENT_START = new Date('2026-06-11T00:00:00Z');
export const TOURNAMENT_ENDED = new Date('2026-07-19T23:59:59Z');

export const isTournamentStarted = () => new Date() >= TOURNAMENT_START;
export const isTournamentOver = () => new Date() > TOURNAMENT_ENDED;

// ─── Match statuses ──────────────────────────────────────────────────────────
export const MATCH_STATUS = {
  SCHEDULED: 'SCHEDULED',
  TIMED: 'TIMED',
  IN_PLAY: 'IN_PLAY',
  PAUSED: 'PAUSED',
  FINISHED: 'FINISHED',
  POSTPONED: 'POSTPONED',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
};

// ─── Stages ──────────────────────────────────────────────────────────────────
export const STAGE_LABELS = {
  GROUP_STAGE: 'Group Stage',
  ROUND_OF_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter Finals',
  SEMI_FINALS: 'Semi Finals',
  THIRD_PLACE: 'Third Place',
  FINAL: 'Final',
};

// ─── Local storage keys ──────────────────────────────────────────────────────
// Only keys that are actively used. Legacy keys (wc_users_db, wc_bets,
// wc_match_predictions, wc_scores) were from the pre-backend era and are
// purged from localStorage on app boot (see App.jsx → purgeLegacyStorage).
export const STORAGE_KEYS = {
  USER: 'wc_user',
};

// Keys that belonged to the old localStorage-only architecture.
// Listed here so App.jsx can clear them once on boot.
export const LEGACY_STORAGE_KEYS = [
  'wc_users_db',
  'wc_match_predictions',
  'wc_bets',
  'wc_scores',
];

// ─── Roles ───────────────────────────────────────────────────────────────────
export const ROLES = {
  ADMIN: 'ADMIN',
  USER: 'USER',
};

// ─── Registration status ─────────────────────────────────────────────────────
export const REG_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};
