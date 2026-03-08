# World Cup 2026 Betting App

A private, invite-only score prediction app for FIFA World Cup 2026.
Players predict match results, compete on a live leaderboard, and earn points for correct calls.

---

## Table of Contents

- [Features](#features)
- [Scoring System](#scoring-system)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Local Setup](#local-setup)
  - [Prerequisites](#prerequisites)
  - [1. Clone the repo](#1-clone-the-repo)
  - [2. Install dependencies](#2-install-dependencies)
  - [3. Set up Supabase](#3-set-up-supabase)
  - [4. Environment variables](#4-environment-variables)
  - [5. Seed the admin user](#5-seed-the-admin-user)
  - [6. Run in development](#6-run-in-development)
- [API Reference](#api-reference)
- [Deployment](#deployment)

---

## Features

- **Score Predictions** — Predict the exact scoreline for any World Cup match before kick-off
- **Live Match Data** — Real-time fixtures, results, and standings via football-data.org
- **Leaderboard** — Live standings with full points breakdown
- **Tournament Bets** — Predict the champion, top scorer, and top assist provider
- **Live Bets Reveal** — Once a match kicks off, all players' predictions are revealed
- **Top Scorers Page** — Live Golden Boot race
- **Admin Panel** — Approve / reject / delete user registrations
- **Invite-Only** — All new registrations require admin approval before access is granted
- **Email Notifications** — Users receive an email when their account is approved

---

## Scoring System

| Outcome | Points |
|---|---|
| Exact score (≤ 4 total goals) | **3 pts** |
| Exact score (≥ 5 total goals) | **5 pts** |
| Correct result (right winner/draw, wrong score) | **1 pt** |
| Tournament Winner prediction | **15 pts** |
| Top Scorer prediction | **5 pts** |
| Top Assist prediction | **5 pts** |

> All bets are **locked** when the tournament starts on **June 11, 2026**.
> Tournament bonus points are applied manually by the admin after the tournament ends.

---

## Tech Stack

### Frontend
| Package | Purpose |
|---|---|
| React 19 + Vite 7 | UI framework + dev server |
| React Router v7 | Client-side routing |
| Mantine v8 | UI components |
| Axios | HTTP client |
| CSS Modules | Scoped per-component styles |

### Backend
| Package | Purpose |
|---|---|
| Express.js | REST API server |
| Supabase (`@supabase/supabase-js`) | PostgreSQL database |
| jsonwebtoken | Stateless JWT sessions (7-day expiry) |
| bcrypt | Password hashing (12 salt rounds) |
| Resend | Transactional email on approval |

### External API
- **[football-data.org](https://www.football-data.org/)** — World Cup fixtures, scores, scorers, and team data

---

## Project Structure

```
World-Cup/
├── src/                          # React frontend
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── RegisterPage.jsx
│   │   ├── HomePage.jsx          # Today's matches + leaderboard
│   │   ├── AllGamesPage.jsx      # Full schedule by stage & group
│   │   ├── ProfilePage.jsx       # Personal bets + predictions history
│   │   ├── AdminPage.jsx         # User management (admin only)
│   │   └── TopScorersPage.jsx    # Golden Boot standings
│   ├── components/
│   │   ├── Navbar.jsx
│   │   ├── MatchCard.jsx
│   │   ├── BetModal.jsx          # Place / edit a match prediction
│   │   ├── LiveScoreBanner.jsx   # Live score ticker during active games
│   │   ├── LiveBetsReveal.jsx    # Show everyone's predictions for live matches
│   │   ├── SkeletonCard.jsx      # Loading placeholder
│   │   └── TeamFlag.jsx          # Country flag + TLA
│   ├── context/
│   │   └── AuthContext.jsx       # Global auth state + user/score management
│   ├── services/
│   │   ├── footballService.js    # football-data.org API calls
│   │   └── serverApi.js          # Express backend API calls
│   ├── hooks/
│   │   ├── useMatches.js         # Full WC schedule (cached in memory)
│   │   └── useTodayMatches.js    # Today's matches with auto-refresh
│   └── utils/
│       └── constants.js          # Roles, statuses, stage labels, tournament dates
│
└── server/                       # Express backend
    ├── index.js                  # Entry point — registers all routes
    ├── routes/
    │   ├── auth.routes.js        # POST /auth/register, POST /auth/login
    │   ├── users.routes.js       # GET/PATCH/DELETE /users
    │   ├── predictions.routes.js # GET/POST /predictions
    │   ├── scores.routes.js      # GET /scores, POST /scores/recalculate
    │   └── football.routes.js    # GET /football/* → proxy to football-data.org
    ├── middleware/
    │   ├── auth.js               # JWT verification (requireAuth)
    │   ├── adminOnly.js          # Role guard (requireAdmin)
    │   └── errorHandler.js       # Central Express error handler
    ├── services/
    │   └── email.js              # Resend email service
    └── config/
        ├── supabase.js           # Supabase client (service role key)
        └── football.js           # football-data.org base URL + competition code
```

---

## Local Setup

### Prerequisites

- **Node.js** v18 or higher
- **npm** v9 or higher
- A free [Supabase](https://supabase.com/) account
- A free [football-data.org](https://www.football-data.org/) API token
- A free [Resend](https://resend.com/) account (for email — optional for local dev)

---

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd World-Cup
```

---

### 2. Install dependencies

```bash
# Frontend (run from project root)
npm install

# Backend (run from the server folder)
cd server
npm install
cd ..
```

---

### 3. Set up Supabase

Create a new Supabase project at [supabase.com](https://supabase.com/), then run the following SQL in the **SQL Editor** to create the required tables.

#### `users` table

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
```

#### `predictions` table

```sql
create table public.predictions (
  user_id   text not null references public.users(id) on delete cascade,
  match_id  text not null,
  home      integer not null,
  away      integer not null,
  primary key (user_id, match_id)
);
```

> **Row Level Security** — the backend uses the **Service Role key** which bypasses RLS entirely. You can leave RLS disabled on both tables, or enable it — the server will still work either way.

---

### 4. Environment variables

#### Backend — create `server/.env`

```env
# Express server port (default: 5000)
PORT=5000

# Supabase — find these in your project Settings → API
SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# JWT — any long random string, e.g. openssl rand -hex 32
JWT_SECRET=your_super_secret_jwt_key

# football-data.org API token
FOOTBALL_API_TOKEN=your_football_data_token

# Resend API key — for approval email notifications
# Get one free at https://resend.com/
RESEND_API_KEY=re_your_resend_key

# Allowed CORS origin (your frontend URL)
CLIENT_ORIGIN=http://localhost:5173
```

#### Frontend — create `.env` in the project root

```env
# URL of the Express backend
VITE_SERVER_URL=http://localhost:5000
```

> The Vite dev server proxies all `/server/*` requests to `http://localhost:5000` automatically (configured in `vite.config.js`), so during development the `VITE_SERVER_URL` variable is mainly used as a fallback.

---

### 5. Seed the admin user

The app requires one admin account to approve new registrations. Insert it directly into Supabase via the **SQL Editor**.

> **Important:** bcrypt-hash the password before inserting. You can use [bcrypt-generator.com](https://bcrypt-generator.com/) (12 rounds) or run:
> ```bash
> node -e "const b=require('bcrypt'); b.hash('Admin123!',12).then(console.log)"
> ```
> (Run this from inside the `server/` folder after installing dependencies.)

Then insert the admin row:

```sql
insert into public.users (id, email, password, name, role, status)
values (
  'user-admin-001',
  'admin@worldcup.com',
  '$2b$12$YOUR_BCRYPT_HASH_HERE',
  'Admin',
  'ADMIN',
  'APPROVED'
);
```

Default credentials (change as needed):
- **Email:** `admin@worldcup.com`
- **Password:** `Admin123!`

---

### 6. Run in development

Run the frontend and backend together:

```bash
npm run dev:all
```

Or separately in two terminals:

```bash
# Terminal 1 — Vite frontend (http://localhost:5173)
npm run dev

# Terminal 2 — Express backend (http://localhost:5000)
npm run server:dev
```

Verify the backend is running:
```
GET http://localhost:5000/health
→ { "status": "ok", "timestamp": "..." }
```

---

## API Reference

All protected routes require a `Authorization: Bearer <token>` header.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/register` | — | Register new user (status: PENDING) |
| `POST` | `/auth/login` | — | Login — returns JWT + user object |

**Register body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secret123",
  "winningTeam": "Brazil",
  "topScorer": "Vinicius Jr.",
  "topAssist": "Bruno Fernandes"
}
```

---

### Users (admin only)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/users` | Admin | List all users |
| `PATCH` | `/users/:id/status` | Admin | Approve or reject a user |
| `DELETE` | `/users/:id` | Admin | Permanently delete a user + their predictions |
| `PATCH` | `/users/:id/bet` | User (own) | Update tournament bets |

**PATCH `/users/:id/status` body:**
```json
{ "status": "APPROVED" }   // or "REJECTED" / "PENDING"
```

---

### Predictions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/predictions?userId=X` | User | All predictions by a user |
| `GET` | `/predictions?userId=X&matchId=Y` | User | Single prediction for a match |
| `GET` | `/predictions?matchIds=1,2,3` | User | All predictions for given matches |
| `POST` | `/predictions` | User | Save / update a match prediction (upsert) |

**POST `/predictions` body:**
```json
{
  "user_id": "user-abc123",
  "match_id": "556789",
  "home": 2,
  "away": 1
}
```

---

### Scores

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/scores` | User | Leaderboard — current scores for all approved users |
| `POST` | `/scores/recalculate` | Admin | Recalculate all scores from finished matches |

**POST `/scores/recalculate` body** (all fields optional — only at end of tournament):
```json
{
  "tournamentWinner": "Argentina",
  "actualTopScorer": "Lionel Messi",
  "actualTopAssist": "Angel Di Maria"
}
```

---

### Football (proxy)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/football/matches` | User | All WC matches |
| `GET` | `/football/scorers` | User | Top scorers |
| `GET` | `/football/teams` | User | All WC teams |
| `GET` | `/health` | — | Server health check |

---

## Deployment

### Frontend (Vercel)

The React app is configured for Vercel. A `vercel.json` rewrites all routes to `index.html` for SPA routing.

1. Push to GitHub
2. Import the repo on [vercel.com](https://vercel.com/)
3. Set the **Root Directory** to `/` (the project root)
4. Add the environment variable `VITE_SERVER_URL` pointing to your deployed backend URL
5. Deploy

### Backend (Railway / Render / any Node host)

1. Deploy the `server/` folder as a Node.js service
2. Set all variables from `server/.env` in the hosting platform's environment settings
3. Update `CLIENT_ORIGIN` to your deployed Vercel frontend URL
4. The server starts with `node index.js` (or `npm start`)

---

## License

Private project — not for public distribution.
