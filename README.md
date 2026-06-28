# World Cup 2026 Betting App

A private, invite-only score-prediction PWA for FIFA World Cup 2026 (Jun 11 – Jul 19, 2026). Approved users predict match scores and tournament outcomes and compete on a live leaderboard.

Stack — **Vercel + Supabase only**, free of charge.

---

## Features

- Score predictions for every match before kick-off
- Match schedule + final scores via worldcup26.ir (server-side, narrow proxy)
- Live leaderboard — auto-recomputed from finished matches on every read (≤ 1 min after a real match finishes)
- Predictions revealed to all players once a match kicks off (by clock or live status; enforced in both UI and API)
- Tournament-wide bets (Winner / Top Scorer / Top Assist) — locked at kickoff
- Admin panel: approve / reject / delete users, recalculate scores (used only at end of tournament for the bonus prizes)
- Email notification on approval (Resend, optional)
- **Installable PWA** — Add to Home Screen on iOS & Android
- **Hebrew UI** with full RTL support (English / עברית switcher)
- Login session persists across browser refresh (validated against the backend via `GET /api/auth/me`)

---

## Scoring

Knockout stages award more points the deeper you go. Group-stage scoring (1/3/5) is unchanged from launch so existing leaderboard totals do not shift when the migration ships.

| Stage | Correct direction | Exact (≤ 3 goals) | Exact (≥ 4 goals) |
|---|---|---|---|
| Group stage | **1** | **3** | **5** |
| Round of 32 | **2** | **4** | **6** |
| Round of 16 | **2** | **5** | **7** |
| Quarter-finals | **3** | **7** | **9** |
| Semi-finals | **4** | **9** | **11** |
| Third-place match | **4** | **9** | **11** |
| Final | **5** | **12** | **15** |

Plus, applied at the leaderboard level (not per match):

| Bonus | Points |
|---|---|
| 3 consecutive exact-score predictions (one-time, no stacking) | **+3** |
| Tournament Winner prediction | **15** |
| Top Scorer prediction | **15** |
| Top Assist prediction | **15** |

The high-scoring threshold is `total goals ≥ 4` (e.g. an exact 2-2 or 3-1 earns the high tier).

All match-result and tournament bets **lock at kickoff** (per match) or at the **tournament opening on June 11, 2026** (Winner / Top Scorer / Top Assist).

### Regulation-time rule (knockouts only)

For knockout matches, scoring uses **only the score at the end of regulation time** (90 + added minutes). Extra time and penalties never affect points — even when they decide the actual match on TV. The match card may still show the running/final score; the scoring engine looks at regulation alone.

| Example (knockout) | What the broadcast shows | What scoring uses |
|---|---|---|
| 1-1 at 90', 2-1 after ET | 2-1 final | **1-1** |
| 0-0 at 90', winner on penalties | 0-0 (5-4 PEN) | **0-0** |
| 2-2 at 90', 3-2 after ET | 3-2 final | **2-2** |

If a knockout match went to ET/penalties but no regulation score is available from the live pipeline, the match is treated as **unresolved**: 0 points for everyone, the exact-streak counter does not advance, and a structured warning is logged (`matchId`, `stage`, `homeTeam`, `awayTeam`, `fullTime`, `source`, `wentToExtraTime`, `decidedByPenalties`). The app never silently falls back to the post-ET final score for scoring.

The `PlayerScoreModal` per-match breakdown shows the regulation score with a `90'` tag and a smaller "Final 2-1" note for any knockout match that went to ET/PEN, so users see what scoring was actually based on.

### How scoring updates

| Surface | Cadence |
|---|---|
| `GET /api/scores` (read-only) | Recomputes from finished matches on every request. Server-side 30 s cache. |
| `useHomeMatches` poll (HomePage) | 30 s (live) / 60 s (kickoff < 15 min) / 5 min (idle) |
| Live-score cron (`/api/cron/live-scores`) | Once per minute. Pulls ESPN (primary) → worldcup26 (fallback) and writes only into `matches_mirror`. Freezes `score.regulation` from ESPN linescores at the end of period 2 so ET goals don't overwrite it. |
| Leaderboard refetch | Automatic when any tracked match transitions to FINISHED; also a 60 s opportunistic poll while any match is live |
| Worst-case delay (match finishes upstream → leaderboard updates in UI) | **≤ ~1 minute** (server cache 30 s + client refetch) |
| `POST /api/scores/recalculate` (admin) | Writes a snapshot to `users.scores` and persists the tournament-bonus inputs (`{winner, topScorer, topAssist}`) so they survive future recomputes. Only used at end of tournament. Group-stage points must show zero delta when re-run. |

Missing predictions earn **0 points** and count as a miss — they break any exact-score streak in progress. A user who never opens the prediction modal for a match gets no credit for that match, regardless of the final score. No DB rows are auto-created.

---

## Architecture

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite + Mantine v8, deployed to **Vercel** |
| Routing | React Router v7 |
| i18n | `react-i18next` (en, he) with reactive RTL toggle |
| PWA | `vite-plugin-pwa` (Workbox), 192/512/maskable icons, iOS meta tags |
| Backend | **Vercel Serverless Functions** under `/api/*` (single Express app) |
| Database | **Supabase** (Postgres) — `users` and `predictions` tables |
| Schedule source | worldcup26.ir — `/get/games`, `/get/teams` (proxied server-side, 30 s cache, single-flight). Mirrored into Supabase `matches_mirror` by the `/api/cron/refresh-matches` cron. |
| Live-score source | **ESPN** scoreboard (primary) → **worldcup26** (per-match fallback). Polled by `/api/cron/live-scores` once per minute. Captures per-period `linescores` to compute regulation-time score; freezes it at the end of period 2 so ET/penalty goals never overwrite it. |
| Email | Resend (optional) |
| Auth | JWT (7-day) + bcryptjs hashed passwords. Boot-time validation via `GET /api/auth/me` keeps login sticky across refresh. |

The browser never calls worldcup26.ir or ESPN directly — every football request goes through a narrow, typed `/api/football/*` endpoint (`matches`, `matches/today`, `teams`) so the upstream schemas can change without touching the frontend, and credentials never leak.

### All Games — current-stage default

`AllGamesPage` opens on the **live tournament stage** — the first stage in `STAGE_ORDER` that still has any non-FINISHED match. Once all R32 fixtures finish, it auto-advances to R16; same for QF / SF / Third place / Final. After the whole tournament wraps, it lands on the last stage with data (the Final). A user clicking any stage tab locks that choice for the rest of the session. Detection helper: [`src/utils/stages.js`](src/utils/stages.js).

```
World-Cup/
├── api/                          # Vercel Serverless Functions (single Express app)
│   ├── index.js                  # Vercel function entry → re-exports api/_app.js
│   ├── _app.js                   # Express app (mounted at /api/*)
│   ├── _lib/                     # supabase, football, auth, scoring, email, errors
│   └── _routes/                  # auth, users, predictions, scores, football
├── public/
│   ├── manifest.webmanifest      # generated by vite-plugin-pwa
│   ├── pwa-192.png  pwa-512.png  pwa-maskable-512.png  apple-touch-icon.png
│   └── favicon.svg
├── src/
│   ├── pages/                    # Login, Register, Home, AllGames, Profile, Admin, TopScorers, Rules
│   ├── components/               # MatchCard, BetModal, LiveBetsReveal, LanguageSwitcher, …
│   ├── context/                  # AuthContext.jsx + useAuth.js (hook + Context split)
│   ├── hooks/{useMatches, useTodayMatches}.js
│   ├── i18n/                     # i18next bootstrap + locales/{en,he}.json
│   ├── services/{footballService, serverApi}.js
│   └── utils/{constants, matchTime, scoring, stages}.js
├── scripts/resize-icons.ps1      # one-shot PWA icon resizer (PowerShell + GDI+)
├── dev-server.cjs                # Local Express dev server (port 3000) — npm run dev:api
├── vite.config.js                # Vite + PWA + dev proxy /api → :3000
├── vercel.json                   # SPA rewrite (excludes /api)
└── package.json
```

---

## Local setup

### 1. Prerequisites
- Node.js 20+, npm 10+
- Free [Supabase](https://supabase.com/) project
- worldcup26.ir — read endpoints work anonymously today. Optional service-account JWT via `WC26_API_EMAIL` + `WC26_API_PASSWORD` only if upstream starts requiring auth.
- (Optional) Free [Resend](https://resend.com/) account for approval emails

### 2. Install
```bash
npm install
```

### 3. Database — run in Supabase SQL editor
```sql
create table public.users (
  id          text primary key,
  email       text not null unique,
  password    text not null,
  name        text not null,
  role        text not null default 'USER',
  status      text not null default 'PENDING',
  created_at  timestamptz not null default now(),
  bet         jsonb,
  scores      jsonb
);

create table public.predictions (
  user_id   text not null references public.users(id) on delete cascade,
  match_id  text not null,
  home      integer not null,
  away      integer not null,
  primary key (user_id, match_id)
);
```

The backend uses the **service-role key** which bypasses RLS — leave RLS off, or enable it (the server still works either way).

### 4. Environment variables — copy `.env.example` to `.env`
```env
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=<long random string>
WC26_API_BASE_URL=            # optional override (defaults to https://worldcup26.ir)
WC26_API_EMAIL=               # optional — only if upstream requires JWT
WC26_API_PASSWORD=
RESEND_API_KEY=               # optional
RESEND_FROM_EMAIL=onboarding@resend.dev
CLIENT_ORIGIN=                # only set in prod to lock CORS
VITE_API_BASE_URL=            # leave blank in dev (uses Vite proxy)
```

> In production these go into **Vercel project settings → Environment Variables**.

#### `CLIENT_ORIGIN`
The deployed app URL — for example `https://wc-bets.example.com` (no trailing slash). Two consumers:

1. **CORS allow-list** in [`api/_app.js`](api/_app.js) — when set, the Express CORS middleware locks `Access-Control-Allow-Origin` to this URL. When unset, it reflects whatever origin the request came from (defense-in-depth still requires a valid JWT).
2. **Absolute `/login` link in approval emails** in [`api/_lib/email.js`](api/_lib/email.js) — without `CLIENT_ORIGIN`, the email contains a relative `/login` path, which only resolves correctly if the recipient already has the app open.

Leave blank locally. Set per-environment (Production, optionally Preview) in the Vercel dashboard.

#### Secrets boundary
Only variables prefixed with `VITE_` are bundled into the browser by Vite. Every secret in this project — `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `WC26_API_PASSWORD`, `RESEND_API_KEY` — is **unprefixed** and read exclusively by the serverless functions under `/api`. The `VITE_*` variables in this project (`VITE_API_BASE_URL`, `VITE_SIMULATION_MODE`) hold non-secret configuration. **Never prefix a real secret with `VITE_`** — it would ship to every visitor's browser bundle.

#### Simulation mode (local testing only)

Simulation mode lets you preview the app as if the World Cup is already in progress — finished, live, and upcoming matches, demo predictions, and a working leaderboard — without touching real data.

**Enable locally:**
1. Create or edit `.env.local` (or add to `.env`)
2. Set `VITE_SIMULATION_MODE=true`
3. Restart the dev server (`npm run dev:all`)

**Disable:**
1. Remove `VITE_SIMULATION_MODE` from `.env.local` or set `VITE_SIMULATION_MODE=false`
2. Restart the dev server

**Safety:**
- Off by default — if the variable is missing or not exactly `"true"`, behavior is unchanged
- No Supabase writes — prediction saves and score recalculation are blocked in simulation mode
- Mock data lives in `api/mock/worldCupSimulation.js` — delete that folder and the simulation helpers to remove the feature entirely
- **Do not set `VITE_SIMULATION_MODE=true` in production Vercel env** — Vite bakes it into the build bundle

When enabled, a prominent orange **SIMULATION / DEMO MODE** banner appears at the top of every page.

### 5. Seed the admin user
Run from `World-Cup/`:
```bash
node -e "require('bcryptjs').hash('Admin123!', 12).then(console.log)"
```
Insert into Supabase:
```sql
insert into public.users (id, email, password, name, role, status)
values ('user-admin-001', 'admin@worldcup.com',
  '$2a$12$...your_bcrypt_hash...', 'Admin', 'ADMIN', 'APPROVED');
```

### 6. Run in dev
```bash
npm run dev:all
```
Vite → `http://localhost:5173`, API → `http://localhost:3000` (proxied automatically).
Health check: `http://localhost:3000/api/health`.

The API alone can be started with `npm run dev:api`, which runs [`dev-server.cjs`](dev-server.cjs) — a small Express harness that mounts the same `api/_app.js` used in production on port 3000.

Run unit tests: `npm test` (Vitest — scoring rules in [`tests/scoring.test.js`](tests/scoring.test.js)).

---

## Deployment (Vercel)

1. Push to GitHub.
2. Import the project on [vercel.com](https://vercel.com/) — root directory is `World-Cup/`.
3. Add the environment variables above.
4. Deploy.

Vercel auto-routes `/api/*` to the `api/index.js` serverless function (the entire Express app) and serves the Vite-built static SPA + PWA assets for everything else.

No separate Node host (Railway, Render, etc.) is required — that's the project's hosting rule.

---

## Tournament-bet candidate lists

Per the project rules, the **Top Scorer** and **Top Assist** dropdowns on the profile page render from a fixed list, not the live football API. These lists live in `src/utils/constants.js` as `TOP_SCORERS_LIST` and `TOP_ASSISTS_LIST` and are intentionally empty until the user supplies them — the dropdown shows a "list will be supplied by the admin" placeholder in the meantime.

The **Tournament Winner** dropdown still draws from the live worldcup26.ir team list (`/api/football/teams`).

---

## License

Private project — not for public distribution.
