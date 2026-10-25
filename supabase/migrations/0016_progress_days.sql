-- «Прогресс»: the library at the end of each study day (04:00 local to 04:00), saved by the app the
-- day after (lib/progress.ts ensureProgressDays) and synced like every other table, so every device
-- draws the same history. One row per study day, `id` = "YYYY-MM-DD":
--   known / learning / fresh / difficult / paused / total  words by status at the day's end
--                                                           (lib/core/progress.ts: paused words count
--                                                           only as paused; difficult ⊂ learning)
--   memorized       «помню ≈»: per word, its cards' mean FSRS retrievability, summed (a float)
--   reviews / again / new_introduced / added   what happened that day
--   source          live (written the day after) | replay (rebuilt later from review_log)
--   algo            the FSRS version the numbers came from
-- Written only by the app. Apply before deploying the app version that syncs the table (its pulls
-- read progress_days and fail without it).
create table if not exists public.progress_days (
  id             text not null,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  known          integer not null default 0,
  learning       integer not null default 0,
  fresh          integer not null default 0,
  difficult      integer not null default 0,
  paused         integer not null default 0,
  total          integer not null default 0,
  memorized      double precision not null default 0,
  reviews        integer not null default 0,
  again          integer not null default 0,
  new_introduced integer not null default 0,
  added          integer not null default 0,
  source         text not null default 'live' check (source in ('live', 'replay')),
  algo           text not null default '',
  updated_at     timestamptz not null,
  deleted_at     timestamptz,
  synced_at      timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists progress_days_user_updated_idx on public.progress_days (user_id, updated_at);
create index if not exists progress_days_user_synced_idx  on public.progress_days (user_id, synced_at, id);

create trigger progress_days_stamp before insert or update on public.progress_days for each row execute function public.kartochki_stamp_row();

alter table public.progress_days enable row level security;

create policy "progress_days: select own" on public.progress_days for select to authenticated using (user_id = (select auth.uid()));
create policy "progress_days: insert own" on public.progress_days for insert to authenticated with check (user_id = (select auth.uid()));
create policy "progress_days: update own" on public.progress_days for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "progress_days: delete own" on public.progress_days for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.progress_days from anon;
grant select, insert, update, delete on public.progress_days to authenticated;

-- The connector (service_role, as in 0005/0011/0012) may read the history.
grant select on public.progress_days to service_role;

-- Reviews by time (a day's or a month's answers, for the history and the connector).
create index if not exists review_log_user_review_idx on public.review_log (user_id, review);
