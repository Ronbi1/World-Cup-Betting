# Session handoff — World Cup 2026 Betting App

> **Read this first if you're a new agent picking up the project.** It captures
> the live state at the end of the latest session. The persistent
> product/architecture rules live in
> [`.cursor/rules/project.mdc`](./rules/project.mdc) — that file is
> `alwaysApply: true` so it's already in your context. This file is the
> *transient session log* on top of those rules.

---

## Latest session / current state (Wed Jun 10, 2026 — late evening — PR A + PR B landed)

**Newest section. Always wins over anything below it when they conflict.**

Two PRs were implemented and validated locally; both are still in the
working tree (uncommitted) so the owner can review the diffs before
committing.

### Roadmap status

| PR | Title | Status |
|---|---|---|
| **PR A** | Docs / env cleanup | **✅ done — uncommitted** |
| **PR B** | One-time +3 exact-score bonus + Rules page + EN/HE i18n | **✅ done — uncommitted** |
| PR B.1 | Unit tests for `computeLeaderboard` (scoring) | ⏳ not started |
| PR C | Match cards + World Cup visual language (additive gold token only) | ⏳ not started |
| PR D | Leaderboard podium + mobile leaderboard card list | ⏳ not started |
| PR E | Exact-score spotlight (`GET /api/spotlight`, Asia/Jerusalem cutoff) | ⏳ not started |
| PR F | Mobile bottom-tab nav | ⏳ not started — keep last; do **not** touch safe-area CSS preemptively |

Full umbrella plan with per-PR scope is at
[`.cursor/plans/phase-2-2.5-3-plan_6324729b.plan.md`](./plans/phase-2-2.5-3-plan_6324729b.plan.md).
Detailed PR B plan (for reference / regression diff) is at
[`.cursor/plans/pr-b-exact-score-bonus_80553aa8.plan.md`](./plans/pr-b-exact-score-bonus_80553aa8.plan.md).

### PR A — what shipped (docs + stale-reference sweep)

Pure documentation. Zero runtime code touched. Files modified:

- [`README.md`](../README.md) — architecture tree corrected (`api/index.js` + `dev-server.cjs`, dropped `_local-dev.js`); added `RulesPage`, `useAuth.js`, `matchTime.js` to the src tree; new "Architecture" prose line about the worldcup26.ir proxy boundary; new `CLIENT_ORIGIN` subsection (CORS + email link consumers); new "Secrets boundary" subsection; "Run in dev" note about `npm run dev:api` → `dev-server.cjs`.
- [`.cursor/rules/project.mdc`](./rules/project.mdc) — repository-layout block refreshed (`index.js`, `dev-server.cjs`, `RulesPage`, `context/` split into `AuthContext.jsx` + `useAuth.js`, `utils/matchTime.js`, kickoff-locked `BetModal` note, `hasMatchStarted`, `computeLeaderboard`). Request-flow table updated.
- [`vite.config.js`](../vite.config.js) — proxy comment now references `dev-server.cjs` + `api/index.js`.
- [`api/_app.js`](../api/_app.js) — header comment now references `dev-server.cjs`.

**Explicitly NOT touched in PR A** (intentional):
- Local `.env` — gitignored, user-owned. Still has a stale `SPORTSDB_API_KEY=` line and an outdated comment block mentioning `api/_local-dev.js`. Owner deletes/edits manually.
- This `SESSION_HANDOFF.md` file — transient log; was left alone by PR A. (The current edit you're reading is PR-A-aware though.)
- `.env.example` — already clean before PR A (no `SPORTSDB_API_KEY`, includes `CLIENT_ORIGIN`).
- `TopScorersPage.jsx` "TheSportsDB free V1" inline comment — cosmetic, skipped.

### PR B — what shipped (one-time +3 exact-score bonus)

Product rule (locked by the owner): in this app **virtual 0-0 is the
default prediction state**, not a forgotten/missing prediction. Every
match is treated as 0-0 for every user unless the user actively changes
it. Therefore a default 0-0 that hits exactly counts as an exact-score
hit, and so it counts toward the new +3 threshold as well.

Formula:

```js
exactScoreBonus = exactScores >= 3 ? 3 : 0    // one-time, never stacks
```

- 0/1/2 exact hits → +0
- 3 exact hits → +3
- 4/6/9/12+ exact hits → still +3

Files modified (+85 / −5 lines total across 7 files):

- [`api/_lib/scoring.js`](../api/_lib/scoring.js) — added `EXACT_SCORE_BONUS_MIN: 3` and `EXACT_SCORE_BONUS: 3` to `POINTS`; computed `exactScoreBonus` after the per-match loop (using the existing `exactScores` field — **no** new `savedExactScores` counter, per product rule); added it to `points`; returned it on each row. `calcPoints`, the virtual 0-0 default, and the tournament-bonus block are untouched.
- [`api/_routes/scores.routes.js`](../api/_routes/scores.routes.js) — persisted `exactScoreBonus` in the `POST /scores/recalculate` snapshot with `?? 0` fallback; defaulted the fallback row. No DB migration; pre-existing `users.scores` rows continue to work because read path is dynamic.
- [`src/pages/HomePage.jsx`](../src/pages/HomePage.jsx) — both leaderboard mappers (admin branch + non-admin branch) now carry `exactScoreBonus`. Inside the points cell, a subtle `+3` chip renders only when `row.exactScoreBonus > 0` (with `title` + `aria-label` for the tooltip).
- [`src/pages/HomePage.module.css`](../src/pages/HomePage.module.css) — appended `.pointsCell` flex wrapper + `.bonusChip` pill. RTL-safe (no `margin-left/right`). Literal gold tint (`#d4af37` / `#b8860b`) on purpose — PR C introduces `--clr-accent-gold` and PR C/D will refactor this chip to consume the token.
- [`src/pages/RulesPage.jsx`](../src/pages/RulesPage.jsx) — new `<li>` in the rules list between `correctResult` and `tournamentWinner`; new "Exact-Score Bonus" section card between "How Scoring Updates" and "Predictions Privacy".
- [`src/i18n/locales/en.json`](../src/i18n/locales/en.json) and [`src/i18n/locales/he.json`](../src/i18n/locales/he.json) — five new keys each: `home.rules.exactScoreBonus`, `rules.exactScoreBonusTitle`, `rules.exactScoreBonusBody`, `leaderboard.exactBonusBadge`, `leaderboard.exactBonusTooltip`.

`/api/scores` response shape now: `{ userId, name, points, correctResults, exactScores, exactScoreBonus }`. The bonus is **already folded into `points`** — downstream consumers don't need to add it again.

### PR B — explicitly NOT changed (guardrails)

- `calcPoints` (per-match scoring).
- Virtual 0-0 default at `api/_lib/scoring.js:120-121`.
- `readTournamentBonus` + the tournament-bonus block.
- `POST /api/predictions` kickoff lock + `MAX_PREDICTION_SCORE = 20`.
- `AuthContext`, `useAuth`, `/api/auth/me`.
- PWA safe-area CSS.
- `/api/scores` read-only contract + 30 s cache.
- Any design tokens (`--clr-accent` stays indigo; gold token comes in PR C).
- MatchCard, podium, bottom nav, spotlight — all later PRs.

### Lint / build status

| Check | After PR A | After PR B |
|---|---|---|
| `npm run lint` | exit 0 | exit 0 |
| `npm run build` | exit 0 (910 modules, 8.68 s, same chunk-size warning) | exit 0 (910 modules, 13.50 s, same chunk-size warning) |

### Working tree (uncommitted)

```
M .cursor/rules/project.mdc        (PR A)
M README.md                        (PR A)
M api/_app.js                      (PR A)
M vite.config.js                   (PR A)
M api/_lib/scoring.js              (PR B)
M api/_routes/scores.routes.js     (PR B)
M src/i18n/locales/en.json         (PR B)
M src/i18n/locales/he.json         (PR B)
M src/pages/HomePage.jsx           (PR B)
M src/pages/HomePage.module.css    (PR B)
M src/pages/RulesPage.jsx          (PR B)
```

Owner is reviewing diffs before committing. **Do not commit on the owner's
behalf** unless explicitly asked.

### Manual verification still owed for PR B

- 0/1/2 exact hits → no chip, `points` unchanged from pre-deploy.
- Exactly 3 exact hits → `+3` chip appears next to `points`; total = previous + 3.
- 4th exact hit lands → chip still `+3`; `points` grow only by that match's per-match score.
- Tournament bonus still works independently for a user with a correct winner pick.
- Hebrew leaderboard renders the chip on the inline-end side with the Hebrew tooltip.
- After one `POST /scores/recalculate`, a `users.scores` JSON row contains `exactScoreBonus`.

### Next PR — PR B.1 (unit tests for scoring)

Owner asked for this as the next step. Scope (paraphrased from the umbrella plan §11 question 5):

- Add a minimal test runner (Vitest is the natural choice — already compatible with the Vite toolchain; nothing else in the repo runs tests today).
- Table-driven test for `computeLeaderboard` covering at minimum:
  - 0 / 1 / 2 / 3 / 4 / 6 / 9 / 12 exact hits → expected `exactScoreBonus` of 0/0/0/3/3/3/3/3 and correct `points` delta.
  - Virtual 0-0 contributing to exact-score count when the real result is 0-0.
  - Tournament-bonus override + persisted-bonus merge unaffected by the new bonus.
  - Empty inputs (`users: []`, `finishedMatches: []`, `predictions: []`) — no throws, returns `[]`.
- Add a `test` script in `package.json`. Ensure it lints clean alongside the existing `eslint .` step.
- Document the new test command in `README.md` (single line in §"Run in dev").
- Do **not** start PR C in the same PR.

PR C onwards is gated behind the owner's explicit go-ahead.

---

## Older session — current state (Wed Jun 10, 2026 — evening QA pass)

A targeted QA+fixes pass. Highlights:

- **Auto-scoring**. `GET /api/scores` is now read-only and **computes the
  leaderboard dynamically** on every request from finished matches +
  predictions, with a 30 s server-side cache. The new helper
  `computeLeaderboard()` lives in `api/_lib/scoring.js` (single in-memory
  pass, no DB calls inside the helper). `POST /api/scores/recalculate`
  remains the only writer — it persists a snapshot to `users.scores` and
  also writes the tournament-bonus inputs into `users.scores.tournamentBonus`
  so they survive future recomputes. Frontend refetches `/scores` the
  instant any tracked match flips to `FINISHED`, plus a 60 s opportunistic
  poll on HomePage while any match is live.
- **Missing predictions = virtual 0-0**. No DB rows are auto-created;
  `computeLeaderboard` iterates approved-user × finished-match and treats
  a missing prediction row as `{ home: 0, away: 0 }`.
- **`/rules` page**. New `src/pages/RulesPage.jsx` + module CSS, route in
  `App.jsx`, navbar link in `Navbar.jsx`, and `nav.rules` + `rules.*`
  i18n keys in both `en.json` and `he.json`. Rules block removed from
  `HomePage.jsx`.
- **Leaderboard layout fixed**. `.playerName` no longer applies
  `display: flex` directly on the `<td>` (that was breaking row
  alignment). Inner flex span + truncation + logical
  `border-inline-start` / `text-align: start/end` for RTL. Bet columns
  hide at ≤ 720 px.
- **Custom prediction stepper** in `BetModal.jsx`. Replaces Mantine
  `NumberInput`. Supports keyboard arrows, manual digit typing, 0-20
  clamp, mobile-friendly tap targets, and forced LTR direction inside
  the stepper container so `−` always sits left of the number in RTL.
- **Prediction save validation fixed**. Scores default to `0`, save
  coerces empty/null to `0`, the "both must be filled" guard is gone.
  Saving `1-0` after editing only the home side works.
- **Kickoff-time-or-status reveal rule**, shared between UI and API:
  `Date.now() >= utcDate || status in {IN_PLAY, PAUSED, FINISHED}`. The
  helper `hasMatchStarted(match)` lives in `api/_lib/football.js` and a
  parallel implementation lives in `LiveBetsReveal.jsx`. The backend now
  filters `GET /api/predictions?matchIds=…` so a malicious client can't
  read pre-kickoff bets.
- **Auth survives browser refresh**. `AuthContext` always persists the
  user to localStorage on login. On boot it calls the new
  `GET /api/auth/me` endpoint to validate the token; 401/403 cleans up
  locally, network/5xx keeps the cached user. `ProtectedRoute` now waits
  for `authReady` before deciding. The axios 401 interceptor skips its
  redirect when the failing URL is `/auth/me` (anti-loop).

### Lint / build status

| Check | Result |
|---|---|
| `npm run lint` | **passes — exit 0** (verified Jun 10 evening). |
| `npm run build` | **passes — exit 0** (verified Jun 10 evening). Same pre-existing Vite chunk-size suggestion (>500 kB main bundle). |

---

## Latest session / current state (Wed Jun 10, 2026 — afternoon)

**This is the source-of-truth block.** Anything further down that contradicts
this section is historical and out of date.

### Repo location

The working project lives at:

```
C:\dev\worldcup2\World-Cup-Betting
```

Earlier handoffs referenced `C:\dev\WorldCupApp\World-Cup` — that path no
longer exists on this machine. Always `cd` into `C:\dev\worldcup2\World-Cup-Betting`.

### Dev server

| Surface | URL | Status |
|---|---|---|
| Vite dev (frontend) | http://localhost:5173/ | running, clean |
| Local API (Express) | http://localhost:3000/api/health → `{status:"ok"}` | running, clean |
| Vite → API proxy | `/api/*` → `http://localhost:3000` | configured in `vite.config.js` |

`npm run dev:all` is **currently up and clean**. Both processes were
restarted after a `git pull` + `npm install` earlier today and a verified
`/api/health` call returns 200. There is **no stale dev-server state** to
unwind right now.

`npm run dev:all` **must be run from `C:\dev\worldcup2\World-Cup-Betting`**
(the only place the script is defined in `package.json`). It uses
`concurrently` to launch:

- `npm run dev` → Vite on `:5173`
- `npm run dev:api` → `node dev-server.cjs` on `:3000`

> Note: the local API entry file is **`dev-server.cjs` at the project root**,
> not `api/_local-dev.js`. Older notes that say to run `api/_local-dev.js`
> are wrong — that file doesn't exist anymore. `dev-server.cjs` lives outside
> `api/` on purpose so Vercel doesn't try to deploy a file that calls
> `app.listen(...)` as its own function.

### Football data provider

**worldcup26.ir** ([api docs](https://worldcup26.ir/api-docs/)). The
TheSportsDB migration mentioned further down was already superseded
on Jun 10 by a swap to worldcup26.ir.

- Base URL: `https://worldcup26.ir` (override with `WC26_API_BASE_URL`).
- Endpoints used: `/get/games`, `/get/teams`, and optional `POST /auth/authenticate`.
- Auth: optional JWT — only used if `WC26_API_EMAIL` + `WC26_API_PASSWORD`
  are set; otherwise we hit the read endpoints anonymously.
- Match IDs are integer `1`–`104` from worldcup26 (the full 48-team
  bracket). They are **not** TheSportsDB `idEvent` values; any old
  predictions saved under TheSportsDB IDs will not join to the new schedule.

### REST surface (currently mounted in `api/_app.js`)

All routes live under `/api` and are wrapped by `requireAuth` unless noted.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/api/health` | – | uptime probe |
| POST | `/api/auth/register` | – | create user (status `PENDING`) |
| POST | `/api/auth/login` | – | bcryptjs verify → JWT + sanitized user |
| GET  | `/api/auth/me` | user | verify JWT + return fresh sanitized user (used by AuthContext to keep login sticky across refresh) |
| GET  | `/api/users` | admin | list all users |
| PATCH | `/api/users/:id/status` | admin | approve / reject (sends Resend email on APPROVED) |
| DELETE | `/api/users/:id` | admin | cascade-delete user + predictions |
| PATCH | `/api/users/:id/bet` | self/admin | update tournament bet |
| GET  | `/api/predictions` | user | `?userId=`, `?userId=&matchId=`, or `?matchIds=1,2,3` (matchIds branch only returns rows for matches that have already kicked off — clock OR status) |
| POST | `/api/predictions` | user | upsert one prediction |
| GET  | `/api/scores` | user | leaderboard, **dynamically computed** from finished matches + predictions; 30 s server cache; read-only |
| POST | `/api/scores/recalculate` | admin | re-tally + persist snapshot to `users.scores` + persist tournament-bonus inputs (winner/topScorer/topAssist) into `users.scores.tournamentBonus` so they survive future recomputes |
| GET  | `/api/football/matches` | user | all WC 2026 matches, normalized, cached 30 s |
| GET  | `/api/football/matches/today` | user | matches kicking off today (UTC) |
| GET  | `/api/football/teams` | user | all WC 2026 teams (for Tournament Winner dropdown) |

There is **no `/api/football/today`** — the correct path is `/api/football/matches/today`.

### Vercel function entry

The serverless catch-all is **`api/index.js`** (which simply
`module.exports = require('./_app')`). `vercel.json` rewrites every `/api/*`
URL to `/api`, which lands on that file. Older notes that reference
`api/[...slug].js` are out of date.

### Environment variables (currently required)

From `.env.example`:

| Name | Where | Required | Notes |
|---|---|---|---|
| `SUPABASE_URL` | server | yes | set locally |
| `SUPABASE_SERVICE_ROLE_KEY` | server | yes | set locally |
| `JWT_SECRET` | server | yes | set locally (128-char hex) |
| `WC26_API_BASE_URL` | server | no | defaults to `https://worldcup26.ir` |
| `WC26_API_EMAIL` | server | no | only if upstream starts requiring JWT |
| `WC26_API_PASSWORD` | server | no | paired with `WC26_API_EMAIL` |
| `RESEND_API_KEY` | server | no | blank → email send is a no-op |
| `RESEND_FROM_EMAIL` | server | no | defaults to `onboarding@resend.dev` |
| `CLIENT_ORIGIN` | server | no | only set in prod to lock CORS |
| `VITE_API_BASE_URL` | browser | no | blank in dev (same-origin `/api`) |

`SPORTSDB_API_KEY`, `FOOTBALL_API_TOKEN`, and `COMPETITION_CODE` are **no
longer used anywhere in code**. The local `.env` still has a stale
`SPORTSDB_API_KEY=` line — it's harmless (nothing reads it) but can be
deleted on the next edit pass.

> **Update (PR A, Jun 10 late evening):** all tracked-source references to
> `SPORTSDB_API_KEY`, `api/_local-dev.js`, and `api/[...slug].js` have been
> cleaned. The only remaining mentions are historical paragraphs in this
> handoff file (kept on purpose so older context still makes sense). The
> stale `SPORTSDB_API_KEY=` line in the local `.env` is owner-managed —
> not auto-edited.

### Lint / build status

| Check | Result |
|---|---|
| `npm run lint` | **passes — exit 0, no warnings** (verified Jun 10 afternoon). |
| `npm run build` | **passes — exit 0** (verified Jun 10 afternoon). Same pre-existing Vite chunk-size suggestion (>500 kB main bundle). |

### Git state

| Item | Value |
|---|---|
| Branch | `master`, up to date with `origin/master` |
| Latest commit | `79b1cc1` — _Merge pull request #2 from Ronbi1/feat/fetch-real-time-scors_ |
| Migration commit | `d81d63f` — _feat: migrate from TheSportsDB to worldcup26.ir API and enhance match handling_ |
| Working tree | only `package-lock.json` modified (from `npm install` — safe to commit or discard) |

### Pending items (Jun 10)

Ordered by what to do first.

> **Roadmap status as of late-evening (PR A + PR B done):** see the
> *Roadmap status* table in the newest section at the top of this file
> for PR C–F + PR B.1.

1. **🟡 Verify the Jun 11 opener (tomorrow) appears via `/api/football/matches`.**
   Mexico vs USA. If worldcup26 hasn't published it yet, `AllGamesPage`
   will fall back to the "Schedule Not Available Yet" empty state and
   today's `/api/football/matches/today` will return `[]`.
2. **🟡 `TOP_SCORERS_LIST` and `TOP_ASSISTS_LIST`** in
   `src/utils/constants.js` are still empty arrays on purpose. The Profile
   page dropdowns and `TopScorersPage` both read from these. The owner will
   paste the final list — **do not invent names**.
3. **✅ Done by PR A.** `README.md` no longer references TheSportsDB or
   stale `[...slug].js`/`_local-dev.js` paths. The
   `src/pages/TopScorersPage.jsx` inline comment was intentionally skipped
   (cosmetic only).
4. **🟢 Production Vercel deploy.** Not yet done. Copy every variable
   listed above into Vercel project settings; root directory must be
   `World-Cup-Betting/`. The `api/index.js` function + Vite build should
   deploy without further changes. **`CLIENT_ORIGIN` must be set in
   Production** (CORS lock + absolute `/login` link in approval emails) —
   see the README "CLIENT_ORIGIN" subsection added by PR A.
5. **🟢 Tournament-end bonus.** When the WC ends, an admin must
   `POST /api/scores/recalculate` with
   `{ tournamentWinner, actualTopScorer, actualTopAssist }` to award
   the 15/5/5 bonus points. The HomePage admin panel exposes this — the
   trophy 🏆 toggle reveals the bonus form. The PR B one-time +3
   exact-score bonus is independent — already folded into `points` on
   every read of `/api/scores`, no admin action required.

### Hard "do not"s — currently valid

These are paraphrased from `.cursor/rules/project.mdc`. The TheSportsDB
rule from the previous handoff has been replaced with the worldcup26 one.

- Do **not** re-introduce a separate Node host (Railway, Render, etc.).
  Vercel + Supabase only.
- Do **not** install `bcrypt` (native binary). Use `bcryptjs`.
- Do **not** hard-code UI strings in JSX. Use `t('key')` and add to **both**
  `src/i18n/locales/en.json` and `he.json` in the same change.
- Do **not** call **worldcup26.ir** from the browser — always go through
  `/api/football/{matches,matches/today,teams}`. The frontend has no
  business knowing upstream field names like `home_team_id` or `time_elapsed`.
- Do **not** re-introduce a generic pass-through proxy at `/api/football/*`.
  The proxy is intentionally narrow and typed.
- Do **not** create the Supabase client at module load — use the lazy
  `supabase` Proxy from `api/_lib/supabase.js`.
- Do **not** invent player names for `TOP_SCORERS_LIST` / `TOP_ASSISTS_LIST`.
- Do **not** edit the `description`, `Your role`, or `What this app is`
  sections of `project.mdc` without explicit owner approval.

---

## Current local state (snapshot)

| Surface | URL / Identifier | Status |
|---|---|---|
| Vite dev | http://localhost:5173/ | listening, fresh process |
| Local API (Express) | http://localhost:3000/api/health → `{status:"ok"}` | listening, fresh process |
| Vite ↔ API | proxy `/api → http://localhost:3000` (`vite.config.js`) | wired |
| Supabase | `rmigrbrdtjfsyaxriqhs.supabase.co` | reachable from API |
| Admin row in DB | `admin@worldcup.com` / `Admin123!` | inserted, APPROVED |
| Football data | worldcup26.ir, via `/api/football/{matches,matches/today,teams}` | live and verified |

---

## What changed in the latest session (worldcup26.ir migration, Jun 10)

Commit: `d81d63f` — _feat: migrate from TheSportsDB to worldcup26.ir API and
enhance match handling_.

Concrete changes:

1. **`api/_lib/football.js`** — rewritten to talk to worldcup26.ir.
   - New base URL `https://worldcup26.ir` (overridable with
     `WC26_API_BASE_URL`).
   - Optional JWT auth via `POST /auth/authenticate`, only triggered if
     `WC26_API_EMAIL` + `WC26_API_PASSWORD` are set; 23h cached, 401
     retries refresh once.
   - 30 s games cache + 60 s default cache + single-flight registry,
     keyed by upstream path.
   - Server-side teams cache (`/get/teams`, 5-minute TTL) decorates each
     game with flag + FIFA code without re-fetching per request.
   - New transforms `transformGame`, `transformTeam` map worldcup26 JSON
     (`home_team_id`, `time_elapsed`, `finished`, etc.) into the same
     internal shape (`{ id, utcDate, status, stage, group, homeTeam,
     awayTeam, score: { home, away, fullTime }, … }`) that
     `src/components/*` and `api/_lib/scoring.js` already speak.
   - `mapStatus(finished, timeElapsed)` returns `FINISHED`, `IN_PLAY`,
     `PAUSED`, or `SCHEDULED` based on the upstream `finished` flag plus
     `time_elapsed` strings (`"1h"`, `"2h"`, `"ht"`, numeric, etc.).
   - `mapStage(type, group)` infers `GROUP_STAGE`/`ROUND_OF_32`/…/`FINAL`
     from worldcup26's `type` + `group` fields. WC 2026 has a Round of 32.
2. **`api/_routes/football.routes.js`** — same three typed endpoints
   (`/matches`, `/matches/today`, `/teams`), now wired to the worldcup26
   fetchers. No generic pass-through.
3. **`src/hooks/useTodayMatches.js`** — adaptive polling **restored**
   (worldcup26 exposes live `time_elapsed`, unlike TheSportsDB free V1):
   - 30 s while any match is `IN_PLAY`/`PAUSED`
   - 60 s when kickoff is within 15 min
   - 5 min otherwise
   - plus `visibilitychange` refetch when the tab returns to foreground.
4. **`src/hooks/useMatches.js`** — kept the module-level session cache;
   added a `bustMatchCache()` export so admin recalc can invalidate it.
5. **`src/pages/HomePage.jsx`** — re-introduced `<LiveScoreBanner />`
   above today's match list.
6. **`src/pages/AllGamesPage.jsx`** — `<LiveScoreBanner />` and
   `<LiveBetsReveal />` now also render here over the full schedule.
7. **`src/components/LiveScoreBanner.jsx`** — small polish (`?.` on
   half-time score read).
8. **`src/services/footballService.js`** — comments updated; same thin
   `serverApi` client over `/api/football/*`. `fetchTeams` keeps its
   per-session memo.
9. **`.env.example`** — removed `SPORTSDB_API_KEY`; added
   `WC26_API_BASE_URL`, `WC26_API_EMAIL`, `WC26_API_PASSWORD`.
10. **`.cursor/rules/project.mdc`** — REST table, env-var table,
    architecture diagram, "Hard do not"s, and known follow-ups all
    rewritten to point at worldcup26.

### Trade-offs vs. the TheSportsDB era

| Feature | Status now (worldcup26) | Status under TheSportsDB |
|---|---|---|
| Real-time in-play scores | ✅ available via `time_elapsed` | ❌ free V1 didn't expose them |
| Live `LiveScoreBanner` on Home + AllGames | ✅ rendered | ❌ component was dormant |
| Adaptive polling | ✅ 30s/60s/5min | ❌ slow 5-min only |
| Top-scorers feed | ❌ no equivalent endpoint | ❌ same — list stays static from `TOP_SCORERS_LIST` |
| Standings table | ❌ not wired | ❌ not wired |

---

## Database state (unchanged from earlier handoffs)

Supabase tables:
- `public.users(id, email, password, name, role, status, created_at, bet, scores)`
- `public.predictions(user_id, match_id, home, away)` — composite PK,
  FK to `users` with `on delete cascade`.

Seeded rows:
- `user-admin-001` — `admin@worldcup.com` — ADMIN / APPROVED.

Schema definition (re-runnable, idempotent) lives in
`.cursor/rules/project.mdc` and `README.md`.

---

## Active credentials & where they live

All real secrets live **only in `World-Cup-Betting/.env`** (gitignored).
Do **not** copy them into any tracked file (including this one).

| Var | Status |
|---|---|
| `SUPABASE_URL` | set (`rmigrbrdtjfsyaxriqhs.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | set |
| `JWT_SECRET` | set (128-char hex) |
| `WC26_API_BASE_URL` | unset (defaults to `https://worldcup26.ir`) |
| `WC26_API_EMAIL` | unset (anonymous reads — upstream allows them today) |
| `WC26_API_PASSWORD` | unset |
| `RESEND_API_KEY` | empty (email send is a no-op until set) |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` |
| `CLIENT_ORIGIN` | empty in dev (CORS allow-all). Lock to the Vercel URL in prod. |
| `VITE_API_BASE_URL` | empty (browser uses same-origin `/api`) |
| `SPORTSDB_API_KEY` | _stale leftover line in `.env`, unread by the code_ |

If worldcup26 ever starts requiring auth on `/get/games`:
1. Register a service account at worldcup26.ir.
2. Paste credentials into `.env` as `WC26_API_EMAIL=…` and
   `WC26_API_PASSWORD=…`.
3. Restart the API process — `dotenv` only reads `.env` at Node startup.

---

## Quick smoke tests

```powershell
# Health
curl.exe -s http://localhost:3000/api/health

# Bogus login → expect 401 with "Invalid email or password."
curl.exe -s -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"nobody@x.invalid\",\"password\":\"x\"}'

# Real admin login → expect 200 with token + user object
curl.exe -s -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@worldcup.com\",\"password\":\"Admin123!\"}'

# Football data — must include the JWT from the login above
$tok = (curl.exe -s -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@worldcup.com\",\"password\":\"Admin123!\"}' | ConvertFrom-Json).token

curl.exe -s http://localhost:3000/api/football/matches -H "Authorization: Bearer $tok"
curl.exe -s http://localhost:3000/api/football/matches/today -H "Authorization: Bearer $tok"
curl.exe -s http://localhost:3000/api/football/teams -H "Authorization: Bearer $tok"

# Lint + build
npm run lint
npm run build
```

If `:3000` ever gets wedged (`EADDRINUSE`), kill listeners by PID:

```powershell
Get-NetTCPConnection -LocalPort 3000,5173 -State Listen -ErrorAction SilentlyContinue `
  | Select-Object -ExpandProperty OwningProcess -Unique `
  | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
```

Then `cd C:\dev\worldcup2\World-Cup-Betting; npm run dev:all`.

---

## Key files to read when something feels off

| Symptom | First file to read |
|---|---|
| `EADDRINUSE :::3000` or Vite jumps to `:5174` | Kill stale listeners (PowerShell snippet above), then restart from `C:\dev\worldcup2\World-Cup-Betting`. |
| `Missing script: "dev:all"` | Wrong cwd. Must be `C:\dev\worldcup2\World-Cup-Betting`. |
| `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var` from the API | Either `.env` is missing/incomplete, or Vite's `--watch .env` restart fired mid-request and the API hadn't reloaded yet. Re-run `npm run dev:all` from scratch. |
| Code changes in `api/` not picked up | The Node API doesn't auto-reload. Restart `npm run dev:all` after every change under `api/`. Vite HMR handles `src/` only. |
| 401 / 403 / "session expired" loop | `src/services/serverApi.js`, `api/_lib/auth.js` |
| RTL not flipping for a Mantine component | `src/main.jsx`, `src/components/MantineDirectionSync.jsx` |
| Untranslated string slips through | `src/i18n/locales/{en,he}.json` |
| worldcup26 rate-limit / 429 | `api/_lib/football.js` (30s cache + single-flight + team cache) |
| Wrong stage label on a match | `mapStage(type, group)` inside `api/_lib/football.js` |
| Live status doesn't update on Home/AllGames | `useTodayMatches.js` polls adaptively; worldcup26 `time_elapsed` is the input. Check the raw `/get/games` payload. |
| Score numbers look off | `api/_lib/scoring.js` (pure function, easy to reason about) |
| Profile dropdown empty / TopScorersPage empty | `src/utils/constants.js` (`TOP_SCORERS_LIST`, `TOP_ASSISTS_LIST`) |
| Schedule shows fewer matches than expected | worldcup26's bracket fills in as FIFA finalizes things. Hit the raw upstream `https://worldcup26.ir/get/games` to compare. |
| PWA icon needs replacing | drop new 512px PNG into `public/pwa-512.png`, run `scripts/resize-icons.ps1` |

---

# Historical context (older sessions)

> The sections below describe earlier states of the project. Where they
> conflict with the "Latest session / current state" block at the top, **the
> top block wins**. They are kept here so the next agent can trace why
> certain choices were made.

## Previous session — TheSportsDB v1 migration (Jun 9 evening, superseded)

This migration moved football data from football-data.org → TheSportsDB v1
(league `4429`, season `2026`). It used the env var `SPORTSDB_API_KEY`
(default public key `123`), removed adaptive live polling (free V1 had no
live status), and left `LiveScoreBanner` dormant.

It was completely undone by the worldcup26.ir migration on Jun 10
(commit `d81d63f`). The artefacts that survived:

- The internal data shape (`{ id, utcDate, status, stage, homeTeam, … }`)
  — the worldcup26 transforms produce the same shape, so the frontend
  never needed to change again.
- The typed `/api/football/{matches,matches/today,teams}` endpoints —
  same paths, different backend.
- The `TopScorersPage` rendering from a static `TOP_SCORERS_LIST`
  (worldcup26 also has no top-scorers feed, so this remained the right call).
- The 30 s + single-flight pattern in `api/_lib/football.js`.

That session also documented a stuck dev-server state (stale processes
holding `:3000` / `:5173`, Vite falling back to `:5174`). **Resolved.**
The current dev server is fresh; ignore that block unless it recurs.

## Original migration session (Vercel + Supabase + i18n + PWA, earlier)

Headline changes:

1. Deleted the old `server/` Express folder and `write_profile.py` — the
   project rule is Vercel + Supabase only, no separate Node host.
2. Created `api/` as a single Vercel function:
   - `api/index.js` — Vercel catch-all entry that re-exports `./_app`.
   - `api/_app.js` — Express app, every route mounted at `/api/*`.
   - `dev-server.cjs` (project root) — local Node server on `:3000` for
     `npm run dev:api` / `npm run dev:all`. Lives **outside** `api/`
     on purpose.
   - `api/_lib/{supabase,football,auth,errorHandler,email,scoring}.js`
   - `api/_routes/{auth,users,predictions,scores,football}.routes.js`
   - `api/package.json` with `"type": "commonjs"` so `api/` stays CJS
     while the root project is ESM.
   - Switched `bcrypt` → `bcryptjs` (native binary breaks on Vercel).
   - Made the Supabase client **lazy via a Proxy** so module load never
     crashes when env vars are missing — it only throws on first DB call.
3. **PWA:**
   - Added `vite-plugin-pwa@^1` (the `^0.21` range doesn't support Vite 7).
   - Generated `public/{pwa-192,pwa-512,pwa-maskable-512,apple-touch-icon}.png`
     and `favicon.svg` via `scripts/resize-icons.ps1` (PowerShell + GDI+).
   - Updated `index.html` with `theme-color`, `apple-touch-icon`,
     `apple-mobile-web-app-*` meta tags, and `mobile-web-app-capable`.
   - Service worker excludes `/api/*` from navigation fallback so dynamic
     calls always reach the network.
4. **i18n (Hebrew + English):**
   - `react-i18next` + `i18next-browser-languagedetector`.
   - `src/i18n/index.js` keeps `<html dir lang>` in sync on language change.
   - `src/i18n/locales/{en,he}.json` — every UI string is a key.
   - Added `LanguageSwitcher` component (EN / עב) to navbar + auth pages.
   - Added `MantineDirectionSync` so Mantine modals/inputs/toasts also
     flip to RTL.
   - Switched physical CSS (margin-left/right) to logical properties
     (margin-inline-start/end) where it matters for layout.
5. **Profile page rebuilt** to match `project.mdc` spec:
   - Account → Bet Summary → My Match Predictions → Tournament Bets.
   - Predictions render as `Mexico vs South Africa  0–0`, sorted by kickoff.
   - Tournament Bets editable only before `TOURNAMENT_START` (2026-06-11);
     locked read-only after.
   - Top Scorer / Top Assist dropdowns read from `TOP_SCORERS_LIST` /
     `TOP_ASSISTS_LIST` in `src/utils/constants.js` (still intentionally
     empty). Tournament Winner uses the live API teams.
6. **Frontend wiring:**
   - `serverApi` baseURL is `/api` (was `/server`); falls back to
     `import.meta.env.VITE_API_BASE_URL` if set.
   - `vite.config.js` proxies `/api → http://localhost:3000`.
   - `vercel.json` SPA rewrite excludes `/api/*` so Vercel routes API
     calls to the function instead of falling back to `index.html`.
7. Admin seed: bcryptjs-hashed `Admin123!`, inserted
   `admin@worldcup.com` into `public.users` with role=ADMIN, status=APPROVED.

---

*End of handoff. Update this file when you finish a major chunk of work
so the next agent inherits an accurate picture.*
