-- «Свои поля»: custom fields on cards. Each word keeps its values in `custom_fields`, a JSON array
-- of {"field_id": text|null, "label": text, "value": text}; field_id points to a shared definition
-- in `field_defs` (null = a field of that one word). Apply before deploying the app version that
-- syncs them (its pushes include custom_fields, its pulls read field_defs).
alter table public.words
  add column if not exists custom_fields jsonb not null default '[]'::jsonb;

create table if not exists public.field_defs (
  id         text not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  hint       text,
  ai_fill    boolean not null default true,
  sort       integer not null default 0,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  synced_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create index if not exists field_defs_user_updated_idx on public.field_defs (user_id, updated_at);
create index if not exists field_defs_user_synced_idx  on public.field_defs (user_id, synced_at, id);

create trigger field_defs_stamp before insert or update on public.field_defs for each row execute function public.kartochki_stamp_row();

alter table public.field_defs enable row level security;

create policy "field_defs: select own" on public.field_defs for select to authenticated using (user_id = (select auth.uid()));
create policy "field_defs: insert own" on public.field_defs for insert to authenticated with check (user_id = (select auth.uid()));
create policy "field_defs: update own" on public.field_defs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "field_defs: delete own" on public.field_defs for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.field_defs from anon;
grant select, insert, update, delete on public.field_defs to authenticated;

-- The connector reads the definitions (list_fields) and maps field names to them; it never edits them.
grant select on public.field_defs to service_role;
