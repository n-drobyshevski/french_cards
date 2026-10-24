-- The connector may change «План повторения» (user_prefs `study_plan`, lib/core/study-plan.ts)
-- with update_study_plan, as the app's Settings → «План повторения» does: insert and update for
-- service_role on user_prefs (0012 granted only select). Writes stamp updated_at past the stored
-- value and are last-write-wins like every synced row; nothing is deleted. Other preferences
-- («Чаще в упражнениях», `exercise_focus`) stay app-only: the connector writes only `study_plan`.
-- Apply before deploying the app version with update_study_plan (without it the tool fails with
-- a permission error; nothing else changes).
grant insert, update on public.user_prefs to service_role;
