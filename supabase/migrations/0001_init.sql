-- Карточки: initial schema.
-- Tables mirror lib/types.ts. Every row adds:
--   user_id    owner, filled from the JWT (auth.uid()) and fenced by RLS
--   synced_at  server clock of the last accepted write; the client pulls by it, so a row
--              edited offline with an old updated_at is still picked up by other devices
-- Ids are client-generated strings (review_state ids are `${word_id}:${direction}`), so they are text.
-- No foreign keys between synced tables: rows arrive in any order and deletes are soft (deleted_at).

-- Last write wins on the server too: an upsert carrying an older (or equal) updated_at than the
-- stored row is dropped instead of overwriting newer data from another device.
create or replace function public.kartochki_stamp_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at <= old.updated_at then
      return null;
    end if;
    new.user_id := old.user_id;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- folders («темы»)
create table public.folders (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug        text not null,
  name        text not null,
  description text,
  color       text not null default '#5a5a57',
  created_by  text not null default 'user',
  locked      boolean not null default false,
  sort        double precision not null default 0,
  updated_at  timestamptz not null,
  deleted_at  timestamptz,
  synced_at   timestamptz not null default clock_timestamp()
);

-- ---------------------------------------------------------------------------------------------
-- words
create table public.words (
  id                text primary key,
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fr                text not null,
  ru                text not null,
  note              text,
  example_fr        text,
  example_ru        text,
  pos               text not null default 'other',
  gender            text not null default 'none',
  slang_level       smallint not null default 0 check (slang_level between 0 and 3),
  verlan            boolean not null default false,
  tags              text[] not null default '{}',
  folder_id         text,
  folder_source     text not null default 'auto',
  folder_confidence text,
  source            text not null default 'manual',
  both_directions   boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null,
  deleted_at        timestamptz,
  synced_at         timestamptz not null default clock_timestamp()
);

-- ---------------------------------------------------------------------------------------------
-- review_state: FSRS card per (word, direction)
create table public.review_state (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word_id        text not null,
  direction      text not null check (direction in ('fr_ru', 'ru_fr')),
  due            timestamptz not null,
  stability      double precision not null default 0,
  difficulty     double precision not null default 0,
  elapsed_days   double precision not null default 0,
  scheduled_days double precision not null default 0,
  learning_steps integer not null default 0,
  reps           integer not null default 0,
  lapses         integer not null default 0,
  state          smallint not null default 0 check (state between 0 and 3),
  last_review    timestamptz,
  updated_at     timestamptz not null,
  deleted_at     timestamptz,
  synced_at      timestamptz not null default clock_timestamp()
);

-- ---------------------------------------------------------------------------------------------
-- review_log: one row per review. Rows are only soft-deleted (deleted_at) when a review is undone.
create table public.review_log (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word_id        text not null,
  direction      text not null check (direction in ('fr_ru', 'ru_fr')),
  rating         smallint not null check (rating between 1 and 4),
  state          smallint not null check (state between 0 and 3),
  due            timestamptz not null,
  stability      double precision not null default 0,
  difficulty     double precision not null default 0,
  elapsed_days   double precision not null default 0,
  scheduled_days double precision not null default 0,
  review         timestamptz not null,
  prev           jsonb,
  updated_at     timestamptz not null,
  deleted_at     timestamptz,
  synced_at      timestamptz not null default clock_timestamp()
);

-- ---------------------------------------------------------------------------------------------
-- reorg_runs: applied automatic re-sorts, kept for undo
create table public.reorg_runs (
  id              text primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at      timestamptz not null default now(),
  applied_at      timestamptz,
  moves           jsonb not null default '[]'::jsonb,
  created_folders text[] not null default '{}',
  updated_at      timestamptz not null,
  deleted_at      timestamptz,
  synced_at       timestamptz not null default clock_timestamp()
);

-- ---------------------------------------------------------------------------------------------
-- Indexes: pull by (user_id, synced_at); (user_id, updated_at) for diagnostics and LWW queries.
create index folders_user_updated_idx      on public.folders      (user_id, updated_at);
create index folders_user_synced_idx       on public.folders      (user_id, synced_at, id);
create index words_user_updated_idx        on public.words        (user_id, updated_at);
create index words_user_synced_idx         on public.words        (user_id, synced_at, id);
create index review_state_user_updated_idx on public.review_state (user_id, updated_at);
create index review_state_user_synced_idx  on public.review_state (user_id, synced_at, id);
create index review_log_user_updated_idx   on public.review_log   (user_id, updated_at);
create index review_log_user_synced_idx    on public.review_log   (user_id, synced_at, id);
create index reorg_runs_user_updated_idx   on public.reorg_runs   (user_id, updated_at);
create index reorg_runs_user_synced_idx    on public.reorg_runs   (user_id, synced_at, id);

-- ---------------------------------------------------------------------------------------------
-- Triggers
create trigger folders_stamp      before insert or update on public.folders      for each row execute function public.kartochki_stamp_row();
create trigger words_stamp        before insert or update on public.words        for each row execute function public.kartochki_stamp_row();
create trigger review_state_stamp before insert or update on public.review_state for each row execute function public.kartochki_stamp_row();
create trigger review_log_stamp   before insert or update on public.review_log   for each row execute function public.kartochki_stamp_row();
create trigger reorg_runs_stamp   before insert or update on public.reorg_runs   for each row execute function public.kartochki_stamp_row();

-- ---------------------------------------------------------------------------------------------
-- Row level security: each user sees and writes only their own rows.
alter table public.folders      enable row level security;
alter table public.words        enable row level security;
alter table public.review_state enable row level security;
alter table public.review_log   enable row level security;
alter table public.reorg_runs   enable row level security;

create policy "folders: select own" on public.folders for select to authenticated using (user_id = (select auth.uid()));
create policy "folders: insert own" on public.folders for insert to authenticated with check (user_id = (select auth.uid()));
create policy "folders: update own" on public.folders for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "folders: delete own" on public.folders for delete to authenticated using (user_id = (select auth.uid()));

create policy "words: select own" on public.words for select to authenticated using (user_id = (select auth.uid()));
create policy "words: insert own" on public.words for insert to authenticated with check (user_id = (select auth.uid()));
create policy "words: update own" on public.words for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "words: delete own" on public.words for delete to authenticated using (user_id = (select auth.uid()));

create policy "review_state: select own" on public.review_state for select to authenticated using (user_id = (select auth.uid()));
create policy "review_state: insert own" on public.review_state for insert to authenticated with check (user_id = (select auth.uid()));
create policy "review_state: update own" on public.review_state for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "review_state: delete own" on public.review_state for delete to authenticated using (user_id = (select auth.uid()));

-- review_log: no delete policy (undo soft-deletes via update).
create policy "review_log: select own" on public.review_log for select to authenticated using (user_id = (select auth.uid()));
create policy "review_log: insert own" on public.review_log for insert to authenticated with check (user_id = (select auth.uid()));
create policy "review_log: update own" on public.review_log for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "reorg_runs: select own" on public.reorg_runs for select to authenticated using (user_id = (select auth.uid()));
create policy "reorg_runs: insert own" on public.reorg_runs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "reorg_runs: update own" on public.reorg_runs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "reorg_runs: delete own" on public.reorg_runs for delete to authenticated using (user_id = (select auth.uid()));

-- Explicit grants (do not depend on the project's default privileges). anon gets nothing.
revoke all on public.folders, public.words, public.review_state, public.review_log, public.reorg_runs from anon;
grant select, insert, update, delete on public.folders, public.words, public.review_state, public.reorg_runs to authenticated;
grant select, insert, update on public.review_log to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Keep-alive for the daily cron (app/api/cron/ping): a trivial query anyone may run.
create or replace function public.ping()
returns integer
language sql
stable
set search_path = ''
as $$ select 1 $$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

revoke all on function public.kartochki_stamp_row() from public, anon, authenticated;
