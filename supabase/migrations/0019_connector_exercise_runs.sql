-- «Упражнения в чате»: a round played in a Claude chat (the connector's play_exercises player or an
-- exercise artifact) is saved, when the user agrees, by save_exercise_result (lib/mcp/tools.ts):
-- the set, if new, and one run row. So service_role may now insert and update exercise_runs too
-- (0011 granted it only select). Its run ids are "xr-" + sha256(set id, started_at), never a
-- device's, so last-write-wins never fights over a row; nothing is deleted.
-- Apply before deploying the app version with save_exercise_result (without it the tool fails with
-- a permission error; nothing else changes).
grant insert, update on public.exercise_runs to service_role;
