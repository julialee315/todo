-- Feature 002 — core tables for multi-user cloud Todo.
-- Contract source of truth: specs/002-cloud-sync-multiuser/contracts/db-schema.md §1.

create table public.tasks (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  title       text        not null check (length(trim(title)) > 0),
  due         date,
  priority    text        not null default 'none'
                          check (priority in ('high','med','low','none')),
  category    text        not null default 'dev'
                          check (category in ('design','dev','meeting','plan','personal')),
  starred     boolean     not null default false,
  done        boolean     not null default false,
  notes       text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_user_due_idx       on public.tasks (user_id, due);
create index tasks_user_created_idx   on public.tasks (user_id, created_at desc);
create index tasks_user_open_idx      on public.tasks (user_id) where done = false;

create table public.subtasks (
  id          uuid        primary key default gen_random_uuid(),
  task_id     uuid        not null references public.tasks(id) on delete cascade,
  user_id     uuid        not null,  -- enforced by trigger to equal parent task's user_id
  text        text        not null check (length(trim(text)) > 0),
  done        boolean     not null default false,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index subtasks_task_sort_idx   on public.subtasks (task_id, sort_order);
create index subtasks_user_idx        on public.subtasks (user_id);

create table public.user_preferences (
  user_id     uuid        primary key references auth.users(id) on delete cascade,
  view        text        not null default 'inbox'
                          check (view in ('inbox','today','upcoming','overdue','done')),
  sort        text        not null default 'created_desc'
                          check (sort in ('created_desc','due_asc','priority','title')),
  theme       text        not null default 'light'
                          check (theme in ('light','dark')),
  seeded_at   timestamptz,
  updated_at  timestamptz not null default now()
);
