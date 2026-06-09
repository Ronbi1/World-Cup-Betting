# Session handoff — World Cup 2026 Betting App

> **Read this first if you're a new agent picking up the project.** It captures
> the live state at the end of the latest session (Tue Jun 9, 2026 — evening).
> The persistent product/architecture rules live in
> [`.cursor/rules/project.mdc`](./rules/project.mdc) — that file is
> `alwaysApply: true` so it's already in your context. This file is the
> *transient session log* on top of those rules.

---

## TL;DR (latest, end of Jun 9, 2026 evening session)

1. **Code is migrated** from football-data.org → TheSportsDB v1. See the
   "Latest session — TheSportsDB migration" block below for the full file
   list and the "Audit findings" subsection for verification.
2. **Lint and build are green.** All source changes verified clean.
3. **The dev server has NOT yet been restarted to pick up the new code.**
   See "⚠ Critical: stuck dev-server state at handoff" immediately below —
   ports `:3000` and `:5173` are held by the pre-migration processes, and
   the most recent `npm run dev:all` attempt failed with `EADDRINUSE` and
   silently moved Vite to `:5174`. **Resolve this before testing anything.**
4. **TheSportsDB has only 15 of an expected 104 WC 2026 matches** as of
   Jun 9, 2026 (verified by direct call). The bracket fills in as FIFA
   finalizes things; the UI handles a partial schedule gracefully. The
   opener is Mexico vs USA on Jun 11, 2026 — check it's there before users
   start placing predictions.
5. **No secrets, no schema changes.** Supabase tables, JWT, bcryptjs,
   scoring rules, leaderboard math, and the Jun-11 tournament lock are all
   byte-for-byte unchanged.

If you're starting fresh and the dev servers are already gone (`Get-NetTCPConnection`
returns empty), just do:

```powershell
cd C:\dev\WorldCupApp\World-Cup
npm run dev:all
```

Then open http://localhost:5173/login and sign in with
`admin@worldcup.com` / `Admin123!`.

---

## ⚠ Critical: stuck dev-server state at handoff

At the moment this handoff was written, the user's machine was in this state:

| Port | PID | Process |
|---|---|---|
| 3000 | **30364** | `api/_local-dev.js` started **before** the TheSportsDB migration — serving stale pre-migration code |
| 5173 | **28832** | Vite started **before** the migration — serving stale build |
| 5174 | (new)   | Vite from the failed re-run, fell back to this port after `:5173` collision |

The most recent `npm run dev:all` printed:

```
[api] Error: listen EADDRINUSE: address already in use :::3000
[vite] Port 5173 is in use, trying another one...
[vite]   ➜  Local:   http://localhost:5174/
```

So **both the API and Vite are running the old code, and a second Vite is
half-running on `:5174` pointing at the stale `:3000` API**. Until this is
unwound, every smoke test will lie.

### How to fix (one-shot PowerShell)

```powershell
# 1. Kill anything still holding :3000 and :5173 (and :5174 from the failed run)
Get-NetTCPConnection -LocalPort 3000,5173,5174 -State Listen -ErrorAction SilentlyContinue `
  | Select-Object -ExpandProperty OwningProcess -Unique `
  | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

# 2. Confirm nothing is listening on those ports
Get-NetTCPConnection -LocalPort 3000,5173,5174 -State Listen -ErrorAction SilentlyContinue

# 3. Start fresh — must be from World-Cup/, NOT from the parent C:\dev\WorldCupApp\
cd C:\dev\WorldCupApp\World-Cup
npm run dev:all
```

Two gotchas that bit the user in this session:

- `npm run dev:all` **only exists in `World-Cup/package.json`**. Running it
  from `C:\dev\WorldCupApp\` (the parent folder) fails with `Missing script: "dev:all"`.
- Running `npm install bcryptjs` from `C:\dev\WorldCupApp\` (also the parent)
  created a stray `node_modules/` outside the project. Harmless, but you can
  delete `C:\dev\WorldCupApp\node_modules\` and any stray `package*.json`
  files that sit next to (not inside) the `World-Cup\` folder.

---

## Current local state (snapshot)

| Surface | URL / Identifier | Status at handoff |
|---|---|---|
| Vite dev (stale, pre-migration) | http://localhost:5173/ | listening — pid `28832` — serving old build |
| Vite dev (new, half-broken) | http://localhost:5174/ | listening — started after the EADDRINUSE failure |
| Local API (Express, stale) | http://localhost:3000/api/health → `{status:"ok"}` | listening — pid `30364` — serving **pre-migration** code |
| Supabase | `rmigrbrdtjfsyaxriqhs.supabase.co` | reachable from API |
| Admin row in DB | `admin@worldcup.com` / `Admin123!` | inserted, APPROVED |
| Football data — code path | TheSportsDB v1, league `4429`, season `2026`, via `/api/football/{matches,matches/today,teams}` | **code complete and lint+build pass**, but **not yet exercised end-to-end** because the API process is the stale one. |
| Football data — direct upstream call | `https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4429&s=2026` | returns 15 events as of Jun 9 evening — see "Audit findings" |

**First action for any new agent:** kill the stale processes per the
"⚠ Critical" block above, then re-check ports:

```powershell
Get-NetTCPConnection -LocalPort 3000,5173,5174 -State Listen -ErrorAction SilentlyContinue
```

Only then are smoke tests against `:3000` meaningful.

---

## Latest session — TheSportsDB migration (Jun 9, 2026 evening)

Reason for the swap: owner wanted to use TheSportsDB v1 instead of
football-data.org. The token for football-data.org had never been pasted into
`.env` anyway, so we were not regressing anything in production usage.

Concrete changes:

1. **`api/_lib/football.js`** — rewritten end-to-end.
   - New base URL `https://www.thesportsdb.com/api/v1/json/{KEY}/`.
   - Reads `SPORTSDB_API_KEY` (defaults to public free key `123`).
   - Same 60 s cache + single-flight registry kept (now keyed by the upstream URL).
   - Adds a one-time, lazy server-side **teams cache** (`lookup_all_teams.php?id=4429`)
     so we can decorate each event with `strTeamBadge` and `strTeamShort` without
     re-fetching per request.
   - New transforms `transformEvent`, `transformTeam` map TheSportsDB JSON
     into the same internal shape the frontend + `scoring.js` already speak.
     `transformEvent` produces `score.fullTime.{home, away}` so `calcPoints`
     keeps working unchanged.
   - Status mapper (`mapStatus`) handles `"Not Started"`, `"Match Finished"`,
     `"FT"`, `"AET"`, `"PEN"`, `"Postponed"`, `"Cancelled"`, plus a defensive
     branch for V2 livescore strings (`"1H"`, `"2H"`, `"HT"`, `"LIVE"`).
   - Stage mapper (`mapStage`) infers `GROUP_STAGE`/`ROUND_OF_32`/…/`FINAL`
     from `intRound`. **WC 2026 has a Round of 32** (48-team format).
2. **`api/_routes/football.routes.js`** — replaced the generic pass-through
   with three typed endpoints:
   - `GET /api/football/matches` — all matches, normalized
   - `GET /api/football/matches/today` — today's matches (UTC), normalized
   - `GET /api/football/teams` — all WC teams (used by ProfilePage winner dropdown)
3. **`api/_routes/scores.routes.js`** — uses the new `fetchFinishedMatches()`
   helper instead of building football-data.org URLs inline. Scoring logic
   itself is unchanged.
4. **`src/services/footballService.js`** — collapsed to a thin client. All
   transforms now live server-side. `fetchScorers` and `fetchStandings` were
   removed (no equivalent endpoint on the free V1 tier).
5. **`src/utils/constants.js`** — dropped `COMPETITION_CODE`. Added
   `ROUND_OF_32` to `STAGE_ORDER` for the WC 2026 format.
6. **`src/hooks/useTodayMatches.js`** — dropped the fast 60 s in-play polling
   (TheSportsDB free V1 doesn't expose live status). Now: initial fetch,
   refetch on tab visibility, slow 5-minute poll, manual `refresh()`.
7. **`src/pages/HomePage.jsx`** — removed `LiveScoreBanner` import + usage.
   The component file is left in place but is effectively dormant (it only
   renders for `IN_PLAY` / `PAUSED` matches, which the free tier never reports).
8. **`src/pages/TopScorersPage.jsx`** — completely rewritten. No longer hits
   any API; renders `TOP_SCORERS_LIST` and `TOP_ASSISTS_LIST` from
   `src/utils/constants.js`. Both lists are still intentionally empty until
   the owner pastes the names.
9. **Locales** — added `stages.ROUND_OF_32` + new `topScorers.*` keys in
   both `en.json` and `he.json`. Removed obsolete `topScorers.empty/loadError/note`
   keys that referred to the live API.
10. **Env** — renamed `FOOTBALL_API_TOKEN` → `SPORTSDB_API_KEY` in `.env`,
    `.env.example`, and `README.md`. Default is the public free key `123`,
    so the variable can stay blank in dev.
11. **`.cursor/rules/project.mdc`** — updated REST surface, env-var table,
    file map, "Hard do not"s, and known follow-ups to reflect TheSportsDB.

### Known trade-offs from this migration

| Lost feature | Why | Restorable how |
|---|---|---|
| Real-time in-play scores | TheSportsDB free V1 doesn't expose live status; events flip directly Not Started → Match Finished | Upgrade to TheSportsDB V2 premium ($9/mo). All client/server hooks are already shaped to absorb the live statuses when they reappear. |
| Live Golden Boot leaderboard | No "top scorers in competition" endpoint on free V1 | The TopScorersPage now renders the static `TOP_SCORERS_LIST` constant. Per the project spec the tournament-bet dropdowns were always supposed to come from a static admin-supplied list anyway. |
| "Predictions revealed at kickoff" timing inside `LiveBetsReveal` | Used to flip on `IN_PLAY`; without that signal it only flips on `FINISHED`. The component's `isMatchStarted()` check is unchanged — it just stops short of pre-finish reveal. | Either V2 premium (re-enables IN_PLAY), or extend `isMatchStarted` to fall back to `Date.now() > utcDate`. Not done in this session because the owner said "remove the live UI"; revisit if pre-finish reveal is wanted back. |
| Standings / group tables | `fetchStandings` removed (was not wired into any page) | Could be added back via `lookuptable.php?l=4429&s=2026` if a Standings page is ever built. |

### Audit findings (Jun 9 evening — after the migration)

A post-migration audit was run before this handoff was written. Results:

| # | Check | Result |
|---|---|---|
| 1 | Files changed in this session | 15 — listed under "Latest session" above |
| 2 | TheSportsDB only called from backend | ✅ — only `api/_lib/football.js` builds upstream URLs. Across `src/` the words "TheSportsDB"/"SPORTSDB" appear only in code comments. |
| 3 | No client-side TheSportsDB calls | ✅ — `src/services/footballService.js` only hits relative `/api/football/*` paths through `serverApi`. |
| 4 | `FOOTBALL_API_TOKEN` fully replaced by `SPORTSDB_API_KEY` | ✅ — only historical mentions in this file (`SESSION_HANDOFF.md`). No live code or config references. |
| 5 | `LiveScoreBanner` not rendered anywhere | ✅ — grep finds only the component's own definition file. No imports/JSX usages in any page or component. |
| 6 | Aggressive live polling removed | ✅ — `setInterval` appears exactly once in `src/`, the slow 5-min safety net in `useTodayMatches.js`. No `POLL_INTERVAL_MS`, no `startPolling`/`stopPolling`. |
| 7 | Betting / leaderboard / locking / Supabase schema untouched | ✅ — `scoring.js` POINTS table byte-identical; `scores.routes.js` GET `/` and POST `/recalculate` math untouched; `TOURNAMENT_START = 2026-06-11T00:00:00Z` and `isTournamentStarted()` unchanged; `public.users` / `public.predictions` schema in `README.md` unchanged. |
| 8 | WC league ID | **`4429`** (constant in `api/_lib/football.js`) |
| 9 | WC 2026 match count returned by TheSportsDB | **15 of an expected 104** as of Jun 9, 2026. The full 48-team format is 72 group + 16 R32 + 8 R16 + 4 QF + 2 SF + 1 third-place + 1 final = 104. Their editor community fills the bracket over time. |
| 10 | `npm run lint` / `npm run build` | both **exit 0**, no warnings beyond Vite's pre-existing 500-kB chunk-size suggestion. |
| 11 | Smoke tests against `:3000` | **all hit the stale pre-migration server** (see ⚠ block above), so results were not authoritative. Need redo after restart. Also: there is **no `/api/football/today` route** — the correct path is `/api/football/matches/today`. |

### Quick smoke tests for the new endpoints (run after the restart)

```powershell
# Login first to get a token
$tok = (curl.exe -s -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@worldcup.com\",\"password\":\"Admin123!\"}' | ConvertFrom-Json).token

# All matches (cached 60 s)
curl.exe -s http://localhost:3000/api/football/matches -H "Authorization: Bearer $tok" | jq '.matches | length'

# Today's matches (note: /matches/today, NOT /today)
curl.exe -s http://localhost:3000/api/football/matches/today -H "Authorization: Bearer $tok"

# All teams (used by Profile winner dropdown)
curl.exe -s http://localhost:3000/api/football/teams -H "Authorization: Bearer $tok" | jq '.teams | length'

# Direct upstream count — independent of our server, useful for diagnosing
# "is the schedule there or not?" questions
curl.exe -s "https://www.thesportsdb.com/api/v1/json/123/eventsseason.php?id=4429&s=2026" `
  | ConvertFrom-Json | Select-Object -ExpandProperty events | Measure-Object | Select-Object Count
```

---

## What was done in the original migration session (chronological)

1. **Deleted `server/` and `write_profile.py`** — the project rule says
   Vercel + Supabase only, no separate Node host (Railway, Render, etc.).
2. **Created `api/` as a single Vercel function**:
   - `api/[...slug].js` — Vercel catch-all entry
   - `api/_app.js` — Express app, every route mounted at `/api/*`
   - `api/_local-dev.js` — local Node server on `:3000` for `npm run dev:all`
   - `api/_lib/{supabase,football,auth,errorHandler,email,scoring}.js`
   - `api/_routes/{auth,users,predictions,scores,football}.routes.js`
   - `api/package.json` with `"type": "commonjs"` so api stays CJS while
     the root project is ESM.
   - Switched **`bcrypt` → `bcryptjs`** (native binary breaks on Vercel).
   - Made the Supabase client **lazy via a Proxy** so module-load never
     crashes when env vars are missing — it only throws on first DB call.
3. **PWA**:
   - Added `vite-plugin-pwa@^1` (the `^0.21` range doesn't support Vite 7).
   - Generated `public/{pwa-192,pwa-512,pwa-maskable-512,apple-touch-icon}.png`
     and `favicon.svg` via `scripts/resize-icons.ps1` (PowerShell + GDI+).
   - Updated `index.html` with `theme-color`, `apple-touch-icon`,
     `apple-mobile-web-app-*` meta tags, and `mobile-web-app-capable`.
   - Service worker excludes `/api/*` from navigation fallback so dynamic
     calls always reach the network.
4. **i18n (Hebrew + English)**:
   - `react-i18next` + `i18next-browser-languagedetector`.
   - `src/i18n/index.js` keeps `<html dir lang>` in sync on language change.
   - `src/i18n/locales/{en,he}.json` — every UI string is a key.
   - Added `LanguageSwitcher` component (EN / עב) to navbar + auth pages.
   - Added `MantineDirectionSync` so Mantine modals/inputs/toasts also
     flip to RTL.
   - Switched physical CSS (margin-left/right, etc.) to logical
     properties (margin-inline-start/end) where it matters for layout.
5. **Profile page rebuilt** to match `project.mdc` spec exactly:
   - Account → Bet Summary → My Match Predictions → Tournament Bets.
   - Predictions render as `Mexico vs South Africa  0–0`, sorted by kickoff.
   - Tournament Bets editable only before `TOURNAMENT_START` (2026-06-11);
     locked read-only after.
   - Top Scorer / Top Assist dropdowns now read from
     `TOP_SCORERS_LIST` / `TOP_ASSISTS_LIST` (currently empty arrays — see
     "Pending items" below). Tournament Winner uses live API teams.
6. **Frontend wiring**:
   - `serverApi` baseURL is now `/api` (was `/server`); falls back to
     `import.meta.env.VITE_API_BASE_URL` if set.
   - `vite.config.js` proxies `/api → http://localhost:3000`.
   - `vercel.json` SPA rewrite excludes `/api/*` so Vercel routes API calls
     to the function instead of falling back to `index.html`.
7. **Updated `.cursor/rules/project.mdc`** to a complete control file
   (file map, REST surface table, env-var table, conventions, hard "do
   not"s, known follow-ups). Product-intent sections preserved verbatim.
8. **Local env wired up**: owner provided real `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`. Login endpoint verified
   reachable (returns clean 401 for bogus creds, no env-var error).
9. **Admin seed**: ran the bcryptjs hash, inserted
   `admin@worldcup.com` / `Admin123!` into `public.users` with role=ADMIN,
   status=APPROVED.

> Note: at the time of that session, the football data provider was still
> football-data.org. It was swapped to TheSportsDB v1 in the **Latest session**
> block above. The `FOOTBALL_API_TOKEN` env var no longer exists; use
> `SPORTSDB_API_KEY` (or leave it blank to use the public free key `123`).

---

## Active credentials & where they live

All real secrets live **only in `World-Cup/.env`** (gitignored). Do **not**
copy them into any tracked file (including this one).

| Var | Status |
|---|---|
| `SUPABASE_URL` | set (`rmigrbrdtjfsyaxriqhs.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | set |
| `JWT_SECRET` | set (128-char hex) |
| `SPORTSDB_API_KEY` | **empty — falls back to the public free key `123` (30 req/min, no signup)** |
| `RESEND_API_KEY` | empty (email send is a no-op until set) |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` |
| `CLIENT_ORIGIN` | empty in dev (CORS allow-all). Lock to the Vercel URL in prod. |
| `VITE_API_BASE_URL` | empty (browser uses same-origin `/api`) |

If/when the owner wants their own TheSportsDB key:
1. Register at [thesportsdb.com](https://www.thesportsdb.com/) for a free private
   key, or pay $9/mo for premium V2 (livescores).
2. Paste it into `.env` as `SPORTSDB_API_KEY=...`
3. Restart the API process — `dotenv` only reads `.env` at Node startup.
   Easiest: kill `npm run dev:all` (Ctrl+C) and re-run it.

---

## Database state

Supabase tables exist (created by owner):
- `public.users(id, email, password, name, role, status, created_at, bet, scores)`
- `public.predictions(user_id, match_id, home, away)` — composite PK,
  FK to users with `on delete cascade`.

Seeded rows:
- `user-admin-001` — admin@worldcup.com — ADMIN / APPROVED.

Schema definition (re-runnable, idempotent) is in
`.cursor/rules/project.mdc` and the README — search for
`create table if not exists public.users`.

---

## Pending items / open todos

Ordered by what to do **first** when you pick this up:

1. **🔴 Resolve the stuck dev-server state** — see "⚠ Critical" block at
   the top of this file. Until the stale `:3000` / `:5173` processes are
   killed and a fresh `npm run dev:all` runs cleanly, nothing else can be
   verified end-to-end.
2. **🔴 Re-run the migration smoke tests** against the fresh server — the
   four `curl` snippets are in "Quick smoke tests for the new endpoints"
   above. Expected results: health → 200; matches → 200 with `~15`
   normalized events; today → 200 with `[]` (until kickoff tomorrow); teams
   → 200 with all WC 2026 nations.
3. **🟡 Browser smoke test** — the owner hasn't yet confirmed a visual
   login at http://localhost:5173/login. The HTTP API path is the
   migration's contract; a browser session (cookies, service worker, PWA
   install prompt, RTL flip, ProfilePage team dropdown) is the next manual
   check.
4. **🟡 Verify the Jun 11 opener appears** — tomorrow's opener is
   Mexico vs USA. TheSportsDB only has 15 of 104 fixtures in their DB.
   Hit `/api/football/matches` after restart and confirm the opener is in
   the list. If not, the owner can add it via TheSportsDB's editor portal
   or wait for the community to fill it in.
5. **🟡 `TOP_SCORERS_LIST` and `TOP_ASSISTS_LIST`** in `src/utils/constants.js`
   are intentionally empty arrays. Both the Profile page dropdowns AND the
   `TopScorersPage` now render from these constants. The page shows a
   "List not supplied yet" placeholder. **Do not invent names** — the owner
   will paste them.
6. **🟢 Production Vercel deploy** — not yet done. Will need every env var
   from `.env` copied into Vercel project settings, root directory set to
   `World-Cup/`. The build, manifest, and `api/[...slug].js` function
   should deploy without further changes. `SPORTSDB_API_KEY` can stay
   blank in Vercel too (defaults to public `123`), but a private key is
   recommended for production so other users of the shared `123` key
   don't burn your rate-limit budget.
7. **🟢 Tournament-end bonus** — at the end of the World Cup, an admin must
   POST to `/api/scores/recalculate` with
   `{ tournamentWinner, actualTopScorer, actualTopAssist }` to award
   the 15/5/5 bonus points. The HomePage admin panel exposes this
   (the trophy 🏆 toggle reveals the bonus form).
8. **🟢 Optional follow-up — TheSportsDB V2 premium** ($9/mo). Would unlock
   2-minute livescores, which would re-enable `LiveScoreBanner` and the
   "Live!" indicators inside `LiveBetsReveal`. All client/server hooks are
   already shaped to absorb the live status when it returns.

---

## Hard "do not"s (carried from `project.mdc`)

- Do **not** re-introduce the deleted `server/` folder or any non-Vercel host.
- Do **not** install `bcrypt` (native). Use `bcryptjs`.
- Do **not** hard-code UI strings in JSX. Use `t('key')` and add to BOTH
  `locales/en.json` and `locales/he.json` in the same change.
- Do **not** call TheSportsDB from the browser — always go through
  `/api/football/{matches,matches/today,teams}`.
- Do **not** re-introduce a generic `/api/football/*` pass-through proxy.
  The endpoints are intentionally typed + narrow.
- Do **not** create the Supabase client at module load — use the lazy
  `supabase` Proxy from `api/_lib/supabase.js`.
- Do **not** invent player names for `TOP_SCORERS_LIST` / `TOP_ASSISTS_LIST`.
- Do **not** edit the `description`, `Your role`, or `What this app is`
  sections of `project.mdc` without explicit owner approval.

---

## Quick verification commands

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

# Lint + build
npm run lint
npm run build
```

---

## Key files to read when something feels off

| Symptom | First file to read |
|---|---|
| `EADDRINUSE :::3000` or Vite jumps to `:5174` | "⚠ Critical: stuck dev-server state" block at the top of this file — kill the stale process by pid, then restart. |
| `Missing script: "dev:all"` | Wrong cwd. Must run from `World-Cup/`, not `C:\dev\WorldCupApp\`. |
| Code changes aren't being picked up | The Node API doesn't auto-reload. Restart `npm run dev:all` after every `api/` change. Vite HMR handles `src/`. |
| 401 / 403 / "session expired" loop | `src/services/serverApi.js`, `api/_lib/auth.js` |
| RTL not flipping for a Mantine component | `src/main.jsx`, `src/components/MantineDirectionSync.jsx` |
| Untranslated string slips through | `src/i18n/locales/{en,he}.json` |
| TheSportsDB rate-limit / 429 | `api/_lib/football.js` (60s cache + single-flight + lazy teams cache) |
| Wrong stage label on a match | `mapStage(intRound)` inside `api/_lib/football.js` |
| Match status stuck on `SCHEDULED` after kickoff | TheSportsDB free V1 won't update until "Match Finished". Not a bug — see Latest session notes. |
| Score numbers look off | `api/_lib/scoring.js` (pure function, easy to reason about) |
| Profile dropdown empty / TopScorersPage empty | `src/utils/constants.js` (`TOP_SCORERS_LIST`, `TOP_ASSISTS_LIST`) |
| Schedule shows fewer matches than expected | TheSportsDB's WC 2026 bracket is partial (15 of 104 at handoff time). Compare with the direct upstream call in "Quick smoke tests". |
| PWA icon needs replacing | drop new 512px PNG into `public/pwa-512.png`, run `scripts/resize-icons.ps1` |

---

*End of handoff. Update this file when you finish a major chunk of work
so the next agent inherits an accurate picture.*
