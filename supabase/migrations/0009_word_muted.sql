-- «На паузе»: a word kept in the library but left out of review and practice (the trash and mute
-- buttons on the review card, «Вернуть в повторения» in the word card). Synced like the other
-- word columns. Apply before deploying the app version that syncs it (its pushes include it).
alter table public.words
  add column if not exists muted boolean not null default false;
-- The table-level grants of 0001 (authenticated) and 0005 (service_role) cover new columns.
