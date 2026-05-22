-- Feature 002 — Realtime publication for postgres_changes streaming.
-- Contract source of truth: specs/002-cloud-sync-multiuser/contracts/db-schema.md §4.
--
-- All three tables flow through supabase_realtime. The client filters by
-- user_id=eq.${userId}; RLS provides a second layer so a misconfigured client
-- still cannot read another user's events.

alter publication supabase_realtime add table
  public.tasks,
  public.subtasks,
  public.user_preferences;
