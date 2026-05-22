-- Feature 002 — triggers for updated_at + subtasks.user_id integrity.
-- Contract source of truth: specs/002-cloud-sync-multiuser/contracts/db-schema.md §2.
--
-- Both functions are SECURITY INVOKER per Constitution v1.1.0 Governance
-- (SECURITY DEFINER functions must not live in `public`).

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

create trigger subtasks_touch_updated_at
  before update on public.subtasks
  for each row execute function public.touch_updated_at();

create trigger preferences_touch_updated_at
  before update on public.user_preferences
  for each row execute function public.touch_updated_at();

-- subtasks.user_id is forced to equal the parent task's user_id so a client
-- cannot insert a subtask under their own task while claiming a different
-- owner. RLS WITH CHECK would not catch this on its own.
create or replace function public.subtasks_enforce_user_id()
returns trigger
language plpgsql
security invoker
as $$
begin
  select user_id into new.user_id from public.tasks where id = new.task_id;
  if new.user_id is null then
    raise exception 'subtasks.task_id does not reference an existing task';
  end if;
  return new;
end;
$$;

create trigger subtasks_enforce_user_id_trg
  before insert or update of task_id on public.subtasks
  for each row execute function public.subtasks_enforce_user_id();
