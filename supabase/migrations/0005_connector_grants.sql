-- The Claude connector (app/api/mcp, docs/CONNECTOR.md) runs with the Supabase secret key, i.e.
-- as service_role, which bypasses RLS; lib/mcp/repo.ts filters every query on MCP_USER_ID.
-- Explicit grants, as in 0001: do not depend on the project's default privileges. The connector
-- reads all four tables and inserts and updates (never deletes) folders, words and review_state.

grant select on public.folders, public.words, public.review_state, public.review_log to service_role;
grant insert, update on public.folders, public.words, public.review_state to service_role;
