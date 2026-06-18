-- Realtime + anon read access for matches_mirror.
--
-- Lets the browser subscribe to live score/event pushes (goal + card toasts)
-- directly from Supabase, offloading the poll traffic that would otherwise
-- hit the Vercel function. matches_mirror holds only public match data
-- (scores, status, teams) — no user data, no secrets — so anon SELECT is safe.
--
-- STRICTLY ADDITIVE: no changes to any other table. The service-role key used
-- by the cron writers bypasses RLS, so the writers are unaffected.
--
-- Apply once in the Supabase SQL editor (or via the migrations pipeline).

-- 1) Stream row changes to subscribed clients.
alter publication supabase_realtime add table public.matches_mirror;

-- 2) Row-level security: anon may read, nobody may write through the anon key.
alter table public.matches_mirror enable row level security;

drop policy if exists "anon read matches_mirror" on public.matches_mirror;
create policy "anon read matches_mirror"
  on public.matches_mirror
  for select
  to anon
  using (true);

-- Note: we only consume payload.new on the client, so the default replica
-- identity (primary key) is sufficient — no REPLICA IDENTITY FULL needed.
