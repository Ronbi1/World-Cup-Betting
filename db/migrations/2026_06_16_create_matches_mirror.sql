-- Phase 2 — Supabase mirror of worldcup26.ir data.
--
-- This migration is STRICTLY ADDITIVE.
--   * No ALTER on any existing table.
--   * No DROP on any existing table.
--   * No data mutation of any existing row.
--   * No FOREIGN KEYs to/from any existing table.
--
-- Goal: move worldcup26.ir off the user-facing hot path. The Vercel Cron at
-- /api/cron/refresh-matches upserts into these mirror tables; user-facing
-- routes read from them when USE_MATCHES_MIRROR=true. Default off — without
-- the flag, the existing live-fetch path is unchanged.
--
-- Match ID guarantee
-- ------------------
-- matches_mirror.id == String(transformGame(raw).id) == predictions.match_id.
-- The cron writes IDs via the existing transformGame() function in
-- api/_lib/football.js, which is also the only producer of every existing
-- predictions.match_id value in the DB today. The mirror inherits the exact
-- ID set — no remap, no UUID generation, no normalization change.
--
-- Verification (BLOCKING) — must be 0 before flipping USE_MATCHES_MIRROR:
--   select count(*) as predictions_without_matching_mirror
--     from predictions p
--     left join matches_mirror mm on mm.id = p.match_id
--    where mm.id is null;
--
-- Verification (INFORMATIONAL ONLY) — non-blocker:
--   select count(*) as mirror_rows_without_predictions
--     from matches_mirror mm
--     left join predictions p on p.match_id = mm.id
--    where p.match_id is null;

create table if not exists public.matches_mirror (
  id                     text        primary key,
  utc_date               timestamptz,
  status                 text        not null,
  stage                  text,
  "group"                text,
  home_team_id           text,
  home_team_name         text,
  home_team_short_name   text,
  home_team_tla          text,
  home_team_crest        text,
  away_team_id           text,
  away_team_name         text,
  away_team_short_name   text,
  away_team_tla          text,
  away_team_crest        text,
  home_score             int,
  away_score             int,
  matchday               int,
  time_elapsed           text,
  normalized             jsonb       not null,
  source_updated_at      timestamptz,
  mirror_updated_at      timestamptz not null default now()
);

create index if not exists matches_mirror_utc_date_idx
  on public.matches_mirror (utc_date);
create index if not exists matches_mirror_status_idx
  on public.matches_mirror (status);
create index if not exists matches_mirror_mirror_updated_idx
  on public.matches_mirror (mirror_updated_at desc);

create table if not exists public.teams_mirror (
  id                  text        primary key,
  name                text        not null,
  short_name          text,
  tla                 text,
  crest               text,
  founded             int,
  venue               text,
  normalized          jsonb       not null,
  mirror_updated_at   timestamptz not null default now()
);

create index if not exists teams_mirror_name_idx
  on public.teams_mirror (name);
