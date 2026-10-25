-- «Упражнения» at a level: the CEFR levels a set's questions were written for, one or several (the
-- request's «уровня B1–B2», picked in the app or, with «Авто», taken from the level of the set's
-- words). They shape the sentences, the distractors and the mix of item types, not which words are
-- asked (exercise_material `levels`, create_exercise_set `levels` / `level_auto`). `level_auto` is
-- true when they came from «Авто» (the app shows «≈B1»). Empty for older sets. Written by the
-- connector with the rest of the set's content; the app only reads it. Apply before deploying the
-- app version that syncs it (its pushes include both columns).
alter table public.exercise_sets
  add column if not exists levels text[] not null default '{}',
  add column if not exists level_auto boolean not null default false;

alter table public.exercise_sets drop constraint if exists exercise_sets_levels_check;
alter table public.exercise_sets
  add constraint exercise_sets_levels_check check (levels <@ array['A1', 'A2', 'B1', 'B2', 'C1', 'C2']::text[]);
-- The table-level grants of 0011 (authenticated, service_role) cover the new columns.
