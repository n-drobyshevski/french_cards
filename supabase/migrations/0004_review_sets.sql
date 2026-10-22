-- «Мои наборы» (Повторение): named card sets, synced like every other table so all devices see
-- the same sets. Before this they lived in the device-local Settings; the app moves them into its
-- `review_sets` table on upgrade (Dexie v2) and pushes them here. Apply before deploying the app
-- version that syncs the table (its pulls read review_sets and fail without it).
create table if not exists public.review_sets (
  id         text not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  folders    jsonb not null default '[]'::jsonb,
  statuses   jsonb not null default '[]'::jsonb,
  slang      jsonb not null default '[]'::jsonb,
  added      text not null default 'all',
  mode       text not null default 'schedule',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists review_sets_user_updated_idx on public.review_sets (user_id, updated_at);
create index if not exists review_sets_user_synced_idx  on public.review_sets (user_id, synced_at, id);

drop trigger if exists review_sets_stamp on public.review_sets;
create trigger review_sets_stamp before insert or update on public.review_sets for each row execute function public.kartochki_stamp_row();

alter table public.review_sets enable row level security;

drop policy if exists "review_sets: select own" on public.review_sets;
drop policy if exists "review_sets: insert own" on public.review_sets;
drop policy if exists "review_sets: update own" on public.review_sets;
drop policy if exists "review_sets: delete own" on public.review_sets;
create policy "review_sets: select own" on public.review_sets for select to authenticated using (user_id = (select auth.uid()));
create policy "review_sets: insert own" on public.review_sets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "review_sets: update own" on public.review_sets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "review_sets: delete own" on public.review_sets for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.review_sets from anon;
grant select, insert, update, delete on public.review_sets to authenticated;
