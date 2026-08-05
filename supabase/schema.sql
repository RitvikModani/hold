-- Run this once in the Supabase SQL editor.
--
-- The table mirrors the local Rep shape exactly. Reps are immutable events with
-- client-generated ids, which is what makes syncing two devices a set union
-- rather than a conflict-resolution problem — there is no update path, so there
-- is nothing to conflict over.

create table if not exists public.reps (
  id             text primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  video_id       text not null,
  rung_sec       integer not null,
  duration_sec   integer not null,
  watched_sec    real not null,
  skipped_at_sec real,
  drift_events   jsonb not null default '[]'::jsonb,
  recall_text    text not null default '',
  recall_grade   smallint,
  at             timestamptz not null,
  created_at     timestamptz not null default now(),

  constraint recall_grade_range check (recall_grade is null or recall_grade between 1 and 3)
);

-- Every read the app makes is "my reps, oldest first".
create index if not exists reps_user_at_idx on public.reps (user_id, at);

alter table public.reps enable row level security;

-- Without these policies the anon key would be a wide-open door. With them it
-- can only ever reach rows whose user_id matches the signed-in user, which is
-- why that key is safe to ship inside the client bundle.
drop policy if exists "read own reps" on public.reps;
create policy "read own reps"
  on public.reps for select
  using (auth.uid() = user_id);

drop policy if exists "insert own reps" on public.reps;
create policy "insert own reps"
  on public.reps for insert
  with check (auth.uid() = user_id);

-- Deliberately no update policy. The log is append-only; being unable to
-- rewrite your own history is a feature, not an oversight.

drop policy if exists "delete own reps" on public.reps;
create policy "delete own reps"
  on public.reps for delete
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Leaderboard.
--
-- Holds published aggregates only — never reps, video ids or recall text. That
-- is what lets the board be readable by everyone without exposing what anyone
-- actually watched or wrote.
--
-- Ranking is by focus ceiling, deliberately. Ranking by minutes watched would
-- reward leaving a video running in a dead tab; a ceiling requires 95% watched,
-- under 10% drift, and a typed recall answer, so it is hard to post without
-- actually having paid attention.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text not null default 'anonymous',
  ceiling_sec      integer not null default 0,
  clean_reps       integer not null default 0,
  focused_minutes  integer not null default 0,
  streak_days      integer not null default 0,
  updated_at       timestamptz not null default now(),

  constraint display_name_length check (char_length(display_name) between 1 and 24),
  -- Nothing the app can produce exceeds the three-minute cap. A larger number
  -- did not come from using the app.
  constraint ceiling_within_cap check (ceiling_sec between 0 and 180)
);

create index if not exists profiles_ceiling_idx
  on public.profiles (ceiling_sec desc, clean_reps desc);

alter table public.profiles enable row level security;

drop policy if exists "leaderboard is public" on public.profiles;
create policy "leaderboard is public"
  on public.profiles for select
  using (true);

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
