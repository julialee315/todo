-- Feature 002 — Row Level Security: 3 tables × 4 CRUD policies = 12 policies.
-- Contract source of truth: specs/002-cloud-sync-multiuser/contracts/db-schema.md §3.
--
-- Constitution v1.1.0 Governance — every policy includes an ownership
-- predicate (TO authenticated alone is not authorization), every UPDATE has
-- both USING and WITH CHECK, and (select auth.uid()) caches the function
-- call per query.

alter table public.tasks            enable row level security;
alter table public.subtasks         enable row level security;
alter table public.user_preferences enable row level security;

-- tasks
create policy "tasks: own select" on public.tasks
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "tasks: own insert" on public.tasks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "tasks: own update" on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "tasks: own delete" on public.tasks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- subtasks
create policy "subtasks: own select" on public.subtasks
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "subtasks: own insert" on public.subtasks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "subtasks: own update" on public.subtasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "subtasks: own delete" on public.subtasks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- user_preferences
create policy "prefs: own select" on public.user_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "prefs: own insert" on public.user_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "prefs: own update" on public.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "prefs: own delete" on public.user_preferences
  for delete to authenticated
  using ((select auth.uid()) = user_id);
