// Read-only adapters for the user's task corpus and UI preferences.
// Mutations live in tasks-mutations.ts / subtasks.ts / preferences.ts.
//
// All queries are scoped to the caller's user_id, and RLS gates them anyway —
// passing a different user_id returns zero rows rather than someone else's
// data. Tests rely on this via direct chain assertions.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DbSubtaskRow,
  DbTaskRow,
  Task,
  UserPreference,
} from '@/lib/types';
import { dbTaskToDomain } from '@/lib/supabase-store/mappers';

const DEFAULT_PREFERENCES: UserPreference = {
  view: 'inbox',
  sort: 'created_desc',
  theme: 'light',
};

export async function listTasksForUser(
  client: SupabaseClient,
  userId: string,
): Promise<Task[]> {
  const { data: taskRows, error: taskErr } = await client
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (taskErr) throw taskErr;
  if (!taskRows || taskRows.length === 0) return [];

  const taskIds = (taskRows as DbTaskRow[]).map((t) => t.id);
  const { data: subRows, error: subErr } = await client
    .from('subtasks')
    .select('*')
    .in('task_id', taskIds);
  if (subErr) throw subErr;

  const subsByTask = new Map<string, DbSubtaskRow[]>();
  for (const s of (subRows ?? []) as DbSubtaskRow[]) {
    const arr = subsByTask.get(s.task_id) ?? [];
    arr.push(s);
    subsByTask.set(s.task_id, arr);
  }

  return (taskRows as DbTaskRow[]).map((row) =>
    dbTaskToDomain(row, subsByTask.get(row.id) ?? []),
  );
}

export async function loadPreferences(
  client: SupabaseClient,
  userId: string,
): Promise<UserPreference> {
  const { data, error } = await client
    .from('user_preferences')
    .select('view, sort, theme')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ...DEFAULT_PREFERENCES };
  return {
    view: data.view ?? DEFAULT_PREFERENCES.view,
    sort: data.sort ?? DEFAULT_PREFERENCES.sort,
    theme: data.theme ?? DEFAULT_PREFERENCES.theme,
  };
}
