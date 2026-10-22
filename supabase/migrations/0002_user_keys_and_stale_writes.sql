-- 1. Per-user primary keys.
--    Ids are client-generated and some are deterministic (default folders, seed words and their
--    review_state rows), so two accounts can hold the same id. With a global `id` key another
--    account's row made this account's upserts fail RLS forever. Keys are now (user_id, id);
--    the client upserts with onConflict 'user_id,id' and user_id comes from auth.uid().
--
-- 2. Stale writes are reported back instead of dropped silently.
--    With clock skew between devices, an upsert can carry an older updated_at than the stored
--    row although it was made later. The server keeps the stored row (last write wins), but it
--    now re-stamps that row's synced_at, so the device that pushed the stale copy pulls the
--    winner on its next cycle and both devices converge.

create or replace function public.kartochki_stamp_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at <= old.updated_at then
      old.synced_at := clock_timestamp();
      return old;
    end if;
    new.user_id := old.user_id;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.kartochki_stamp_row() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['folders', 'words', 'review_state', 'review_log', 'reorg_runs'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_pkey');
    execute format('alter table public.%I add constraint %I primary key (user_id, id)', t, t || '_pkey');
  end loop;
end;
$$;
