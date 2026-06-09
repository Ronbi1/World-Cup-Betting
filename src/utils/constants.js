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

// ─── Stages (canonical order) ────────────────────────────────────────────────
// WC 2026 has 48 teams in 12 groups → Round of 32 → R16 → QF → SF → F.
export const STAGE_ORDER = [
  'GROUP_STAGE',
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE',
  'FINAL',
];

// ─── Local storage keys ──────────────────────────────────────────────────────
// Only keys actively used. Legacy keys (wc_users_db, wc_bets,
// wc_match_predictions, wc_scores) belonged to the pre-backend era and are
// purged from localStorage on app boot (see App.jsx).
export const STORAGE_KEYS = {
  USER: 'wc_user',
};

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

// ─── Tournament-bet candidate lists ──────────────────────────────────────────
// Per project.mdc: the Top Scorer / Top Assist dropdowns on the profile page
// must be a *fixed* list supplied by the user — not the live API list. Until
// the user provides the final list these arrays stay empty, and the profile
// dropdown shows a "list will be supplied" placeholder.
//
// The Tournament Winner dropdown still draws from the live API (all teams
// playing in the World Cup) — see ProfilePage.
export const TOP_SCORERS_LIST = [];
export const TOP_ASSISTS_LIST = [];
