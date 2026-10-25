-- «План и прогресс»: what the plan allowed on each study day, kept with the day's progress_days row
-- (lib/core/plan.ts DayPlanSnapshot): {ceiling, budget, reason, cap, due, deferred, forecast7,
-- override}. The app keeps today's snapshot in the synced user_prefs row `plan_day` (a new key: the
-- table has no key constraint, nothing to change there) and copies it into yesterday's row when it
-- writes that row the day after (lib/progress.ts ensureProgressDays). Null when it wasn't kept
-- (replayed days, everything before this migration). Done counts are never stored: they come from
-- review_log.
-- Apply before deploying the app version that writes it: its pushes send `plan`, and PostgREST
-- rejects an unknown column.
alter table public.progress_days add column if not exists plan jsonb;
