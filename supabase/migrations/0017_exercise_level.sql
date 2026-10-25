-- «Упражнения» at a level: the CEFR level a set's questions were written for (the request's
-- «уровня B1», picked in the app or, with «Авто», taken from the level of the set's words). It
-- shapes the sentences, the distractors and the mix of item types, not which words are asked
-- (exercise_material `level`, create_exercise_set `level` / `level_auto`). `level_auto` is true
-- when the level came from «Авто» (the app shows «≈B1»). Null for older sets. Written by the
-- connector with the rest of the set's content; the app only reads it. Apply before deploying the
-- app version that syncs it (its pushes include both columns).
alter table public.exercise_sets
  add column if not exists level text,
  add column if not exists level_auto boolean not null default false;

alter table public.exercise_sets drop constraint if exists exercise_sets_level_check;
alter table public.exercise_sets
  add constraint exercise_sets_level_check check (level is null or level in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2'));
-- The table-level grants of 0011 (authenticated, service_role) cover the new columns.
