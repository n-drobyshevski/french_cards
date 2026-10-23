-- «Упражнения» from the user's own weak spots: a set made only of their difficult words, the words
-- due today, or both, taken from every theme (the request builder's «Откуда слова», the quick tiles,
-- the library ledger and the review done screen; the connector's exercise_material `only` and
-- create_exercise_set `scope`). Null for an ordinary set built from themes or a topic. Written by
-- the connector with the rest of the set's content; the app only reads it. Synced like the other
-- exercise_sets columns. Apply before deploying the app version that syncs it (its pushes include it).
alter table public.exercise_sets
  add column if not exists scope text;

alter table public.exercise_sets drop constraint if exists exercise_sets_scope_check;
alter table public.exercise_sets
  add constraint exercise_sets_scope_check check (scope is null or scope in ('difficult', 'due', 'both'));
-- The table-level grants of 0011 (authenticated, service_role) cover the new column.
