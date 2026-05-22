// Shared domain types for demodev Tasks. Shapes mirror the Claude Design
// handoff bundle's store.jsx data structures. Cloud-side row types are
// suffixed `Db…` and `…Insert` and are owned by the supabase-store adapter.

export type Theme = 'light' | 'dark';

export type PriorityId = 'high' | 'med' | 'low' | 'none';

export type CategoryId = 'design' | 'dev' | 'meeting' | 'plan' | 'personal';

export type ViewId = 'inbox' | 'today' | 'upcoming' | 'overdue' | 'done';

export type SortId = 'created_desc' | 'due_asc' | 'priority' | 'title';

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  /** Due date as 'YYYY-MM-DD', or '' when unset. */
  due: string;
  priority: PriorityId;
  category: CategoryId;
  starred: boolean;
  done: boolean;
  notes: string;
  subs: Subtask[];
}

export interface Category {
  id: CategoryId;
  name: string;
  color: string;
}

export interface Priority {
  id: PriorityId;
  name: string;
  color: string;
}

export interface View {
  id: ViewId;
  name: string;
  icon: string;
}

/** A labelled group of tasks produced by groupTasks(). label is null for a
 *  single ungrouped list. */
export interface TaskGroup {
  label: string | null;
  items: Task[];
}

export interface UserPreference {
  view: ViewId;
  sort: SortId;
  theme: Theme;
}

// ---------------------------------------------------------------------------
// Auth + cloud row types (Feature 002). The domain types above stay free of
// any backend awareness; adapters in src/lib/supabase-store/ map between the
// two layers via src/lib/supabase-store/mappers.ts.
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  provider: 'email' | 'google';
}

export interface DbTaskRow {
  id: string;
  user_id: string;
  title: string;
  due: string | null;
  priority: PriorityId;
  category: CategoryId;
  starred: boolean;
  done: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface DbSubtaskRow {
  id: string;
  task_id: string;
  user_id: string;
  text: string;
  done: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DbPreferenceRow {
  user_id: string;
  view: ViewId;
  sort: SortId;
  theme: Theme;
  seeded_at: string | null;
  updated_at: string;
}

/** Shape accepted by `supabase.from('tasks').insert(...)`. The DB fills id,
 *  timestamps, and any column with a NOT NULL default we omit. */
export interface DbTaskInsert {
  user_id: string;
  title: string;
  due?: string | null;
  priority?: PriorityId;
  category?: CategoryId;
  starred?: boolean;
  done?: boolean;
  notes?: string;
}

export interface DbSubtaskInsert {
  task_id: string;
  /** Omitted intentionally — the BEFORE INSERT trigger sets user_id from the
   *  parent task. Including it would be a footgun. */
  text: string;
  done?: boolean;
  sort_order?: number;
}

export interface DbPreferenceUpsert {
  /** RLS WITH CHECK enforces (auth.uid() = user_id); we still pass it
   *  explicitly because user_id is the PK and upsert needs it. */
  user_id: string;
  view?: ViewId;
  sort?: SortId;
  theme?: Theme;
  seeded_at?: string | null;
}

// ---------------------------------------------------------------------------
// Realtime change envelope. Adapters in supabase-store/realtime.ts emit this
// shape so the reducer doesn't have to know about postgres_changes payloads.
// ---------------------------------------------------------------------------

export type RealtimeTable = 'tasks' | 'subtasks' | 'user_preferences';
export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export type RealtimeChange =
  | { table: 'tasks'; event: RealtimeEvent; new: DbTaskRow | null; old: DbTaskRow | null }
  | { table: 'subtasks'; event: RealtimeEvent; new: DbSubtaskRow | null; old: DbSubtaskRow | null }
  | { table: 'user_preferences'; event: RealtimeEvent; new: DbPreferenceRow | null; old: DbPreferenceRow | null };
