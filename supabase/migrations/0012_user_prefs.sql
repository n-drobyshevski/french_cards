-- Preferences that follow the account rather than the device, synced like every other table so
-- the Claude connector can read them too. One row per key (`id`), its value in `value` (jsonb):
--   exercise_focus: «Чаще в упражнениях» (Settings → «Упражнения»), {target, share} — which of the
--                   user's words Claude should favour when it builds an exercise set, and how much
--                   of the set they take (lib/core/exercise-focus.ts). exercise_material reads it,
--                   so it applies even to a request typed in the chat.
-- Written only by the app; the connector only reads. Apply before deploying the app version that
-- syncs the table (its pulls read user_prefs and fail without it).
create table if not exists public.user_prefs (
  id         text not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists user_prefs_user_updated_idx on public.user_prefs (user_id, updated_at);
create index if not exists user_prefs_user_synced_idx  on public.user_prefs (user_id, synced_at, id);

create trigger user_prefs_stamp before insert or update on public.user_prefs for each row execute function public.kartochki_stamp_row();

alter table public.user_prefs enable row level security;

create policy "user_prefs: select own" on public.user_prefs for select to authenticated using (user_id = (select auth.uid()));
create policy "user_prefs: insert own" on public.user_prefs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_prefs: update own" on public.user_prefs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_prefs: delete own" on public.user_prefs for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.user_prefs from anon;
grant select, insert, update, delete on public.user_prefs to authenticated;

-- The connector (service_role, as in 0005/0011) only reads the preferences.
grant select on public.user_prefs to service_role;
