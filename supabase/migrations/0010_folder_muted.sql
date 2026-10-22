-- «Тема на паузе»: every word of the theme stays in the library but out of review and practice
-- until the theme is brought back (the theme menus' «На паузе» toggle, the connector's
-- update_folder). Synced like the other folder columns. Apply before deploying the app version
-- that syncs it (its pushes include it).
alter table public.folders
  add column if not exists muted boolean not null default false;
-- The table-level grants of 0001 (authenticated) and 0005 (service_role) cover new columns.
