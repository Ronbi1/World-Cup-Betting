// ─── Tournament dates ────────────────────────────────────────────────────────
// World Cup 2026: June 11 – July 19, 2026
import { isSimulationMode } from './simulation';

export const TOURNAMENT_START = new Date('2026-06-11T00:00:00Z');
export const TOURNAMENT_ENDED = new Date('2026-07-19T23:59:59Z');

export const isTournamentStarted = () =>
  isSimulationMode || new Date() >= TOURNAMENT_START;
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
// wc_user is a non-sensitive UI cache only — the JWT lives in the HttpOnly
// wc_session cookie. Legacy keys are purged from localStorage on app boot
// (see App.jsx).
export const STORAGE_KEYS = {
  USER: 'wc_user',
};

export const LEGACY_STORAGE_KEYS = [
  'wc_token',
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
// Each list is grouped into tiers. The Profile dropdown renders each tier as
// an <optgroup>; the stored value is still the plain player string, so old
// bets remain valid after restructuring.
export const TOP_SCORERS_LIST = [
  {
    labelKey: 'profile.bets.tier1',
    players: [
      'Kylian Mbappe – France',
      'Erling Haaland – Norway',
      'Harry Kane – England',
      'Lionel Messi – Argentina',
      'Lamine Yamal – Spain',
      'Vinicius Jr – Brazil',
      'Julian Alvarez – Argentina',
      'Lautaro Martinez – Argentina',
    ],
  },
  {
    labelKey: 'profile.bets.tier2',
    players: [
      'Ousmane Dembele – France',
      'Bukayo Saka – England',
      'Cristiano Ronaldo – Portugal',
      'Rafael Leao – Portugal',
      'Goncalo Ramos – Portugal',
      'Raphinha – Brazil',
      'Kai Havertz – Germany',
      'Jamal Musiala – Germany',
      'Viktor Gyokeres – Sweden',
      'Romelu Lukaku – Belgium',
      'Cody Gakpo – Netherlands',
      'Mikel Oyarzabal – Spain',
      'Victor Osimhen – Nigeria',
    ],
  },
  {
    labelKey: 'profile.bets.tier3',
    players: [
      'Endrick – Brazil',
      'Luis Diaz – Colombia',
      'Ismaila Sarr – Senegal',
      'Khvicha Kvaratskhelia – Georgia',
      'Ollie Watkins – England',
      'Dusan Vlahovic – Serbia',
    ],
  },
];

export const TOP_ASSISTS_LIST = [
  {
    labelKey: 'profile.bets.tier1',
    players: [
      'Lionel Messi – Argentina',
      'Bruno Fernandes – Portugal',
      'Kevin De Bruyne – Belgium',
      'Lamine Yamal – Spain',
      'Jude Bellingham – England',
      'Pedri – Spain',
      'Florian Wirtz – Germany',
      'Martin Odegaard – Norway',
    ],
  },
  {
    labelKey: 'profile.bets.tier2',
    players: [
      'Bernardo Silva – Portugal',
      'Ousmane Dembele – France',
      'Michael Olise – France',
      'Bukayo Saka – England',
      'Raphinha – Brazil',
      'Neymar Jr – Brazil',
      'Lucas Paqueta – Brazil',
      'Jamal Musiala – Germany',
      'Leroy Sane – Germany',
      'Joshua Kimmich – Germany',
      'Achraf Hakimi – Morocco',
      'Frenkie de Jong – Netherlands',
      'Jeremy Doku – Belgium',
      'Mohamed Salah – Egypt',
      'Lee Kang-in – Korea Republic',
      'Takefusa Kubo – Japan',
      'James Rodriguez – Colombia',
      'Luka Modric – Croatia',
      'Alphonso Davies – Canada',
    ],
  },
  {
    labelKey: 'profile.bets.tier3',
    players: [
      'Eberechi Eze – England',
      'Tijjani Reijnders – Netherlands',
      'Leandro Trossard – Belgium',
      'Rayan Cherki – France',
      'Desire Doue – France',
      'Vitinha – Portugal',
    ],
  },
];
