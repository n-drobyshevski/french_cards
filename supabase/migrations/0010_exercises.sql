-- «Упражнения»: Duolingo-style exercise sets that Claude writes through the connector
-- (create_exercise_set, lib/mcp/tools.ts), and the runs the app plays offline. Synced like every
-- other table. Who writes what, so last-write-wins never fights over content:
--   exercise_sets: the connector writes all content (title, items, new_words); the app only sets
--                  deleted_at (soft delete and restore). The id is "x-" + sha256(client_ref), so a
--                  retried create hits the same row.
--   exercise_runs: written only by the device that plays the run, one row upserted per answer.
-- The item and answer JSON shapes are documented in lib/types.ts (ExerciseItem, ExerciseAnswer).
-- Apply before deploying the app version that syncs these tables (its pulls read them and fail
-- without them).
create table if not exists public.exercise_sets (
  id         text not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null,
  topic      text,
  folders    jsonb not null default '[]'::jsonb,
  items      jsonb not null,
  new_words  jsonb not null default '[]'::jsonb,
  source     text not null default 'chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists exercise_sets_user_updated_idx on public.exercise_sets (user_id, updated_at);
create index if not exists exercise_sets_user_synced_idx  on public.exercise_sets (user_id, synced_at, id);

create trigger exercise_sets_stamp before insert or update on public.exercise_sets for each row execute function public.kartochki_stamp_row();

alter table public.exercise_sets enable row level security;

create policy "exercise_sets: select own" on public.exercise_sets for select to authenticated using (user_id = (select auth.uid()));
create policy "exercise_sets: insert own" on public.exercise_sets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "exercise_sets: update own" on public.exercise_sets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "exercise_sets: delete own" on public.exercise_sets for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.exercise_sets from anon;
grant select, insert, update, delete on public.exercise_sets to authenticated;

-- kind: 'set' (the whole set), 'mistakes' (the «Повторить ошибки» round), 'quick' (later: a set
-- built on the device). item_ids: the items the run plays, empty = every item of the set.
-- finished_at null = an unfinished run («Продолжить»).
create table if not exists public.exercise_runs (
  id          text not null,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  set_id      text,
  kind        text not null default 'set',
  item_ids    jsonb not null default '[]'::jsonb,
  started_at  timestamptz not null,
  finished_at timestamptz,
  answers     jsonb not null default '[]'::jsonb,
  total       integer not null,
  first_try   integer not null default 0,
  updated_at  timestamptz not null,
  deleted_at  timestamptz,
  synced_at   timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists exercise_runs_user_updated_idx on public.exercise_runs (user_id, updated_at);
create index if not exists exercise_runs_user_synced_idx  on public.exercise_runs (user_id, synced_at, id);
-- The connector reads recent runs (exercise_material, list_exercise_sets) by started_at.
create index if not exists exercise_runs_user_started_idx on public.exercise_runs (user_id, started_at);

create trigger exercise_runs_stamp before insert or update on public.exercise_runs for each row execute function public.kartochki_stamp_row();

alter table public.exercise_runs enable row level security;

create policy "exercise_runs: select own" on public.exercise_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "exercise_runs: insert own" on public.exercise_runs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "exercise_runs: update own" on public.exercise_runs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "exercise_runs: delete own" on public.exercise_runs for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.exercise_runs from anon;
grant select, insert, update, delete on public.exercise_runs to authenticated;

-- The connector (service_role, as in 0005/0007) writes the sets (create, soft delete, restore:
-- insert and update, never delete) and only reads the runs (the results that close the loop).
grant select, insert, update on public.exercise_sets to service_role;
grant select on public.exercise_runs to service_role;
