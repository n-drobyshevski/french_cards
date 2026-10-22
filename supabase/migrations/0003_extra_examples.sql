-- Further example sentences per word («+ Ещё пример»). The first example stays in
-- example_fr / example_ru, so older app versions and the Claude connector keep working; the rest
-- are a JSON array of {"fr": text, "ru": text|null}. Apply before deploying the app version that
-- syncs the column (its pushes include extra_examples).
alter table public.words
  add column if not exists extra_examples jsonb not null default '[]'::jsonb;
