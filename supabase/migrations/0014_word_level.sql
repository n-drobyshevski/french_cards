-- «Уровень языка»: a CEFR level (A1…C2) stored on a word, and who set it. Null = no stored level:
-- the app and the connector then estimate one on the fly (FLELex, then Lexique frequency;
-- lib/core/level.ts) and never store the estimate. cefr_source is 'user' (picked in the word
-- card), 'chat' (Claude through the connector: add_words / update_word / set_word_levels) or 'ai'
-- (the app's «Определить уровень языка»). A user level is never overwritten by Claude unless asked.
-- Synced like the other word columns. Apply before deploying the app version that syncs them
-- (its pushes, and the connector's upserts, include both columns).
alter table public.words
  add column if not exists cefr text,
  add column if not exists cefr_source text;

alter table public.words drop constraint if exists words_cefr_check;
alter table public.words
  add constraint words_cefr_check check (cefr is null or cefr in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

alter table public.words drop constraint if exists words_cefr_source_check;
alter table public.words
  add constraint words_cefr_source_check check (cefr_source is null or cefr_source in ('user', 'chat', 'ai'));
-- The table-level grants of 0001 (authenticated) and 0005 (service_role) cover new columns.
