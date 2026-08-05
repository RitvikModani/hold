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
