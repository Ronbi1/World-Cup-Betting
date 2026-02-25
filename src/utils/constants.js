// ─── API ────────────────────────────────────────────────────────────────────
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
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
export const STORAGE_KEYS = {
  USER: 'wc_user',
  USERS_DB: 'wc_users_db',
  BETS: 'wc_bets',
  MATCH_PREDICTIONS: 'wc_match_predictions',
  SCORES: 'wc_scores',
};

// ─── Roles ───────────────────────────────────────────────────────────────────
export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
};

// ─── Registration status ─────────────────────────────────────────────────────
export const REG_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};
