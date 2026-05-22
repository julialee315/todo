// Write adapters for tasks. All mutations are gated by RLS: passing a
// task_id that belongs to another user simply affects zero rows.
//
// All functions take a SupabaseClient explicitly so tests can inject a mock.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CategoryId, DbTaskRow, PriorityId, Task } from '@/lib/types';
import {
  dbTaskToDomain,
  domainTaskToDbInsert,
} from '@/lib/supabase-store/mappers';

interface AddTaskInput {
  title: string;
  due?: string;
  priority?: PriorityId;
  category?: CategoryId;
  starred?: boolean;
  notes?: string;
}

export async function addTask(
  client: SupabaseClient,
  userId: string,
  input: AddTaskInput,
): Promise<Task> {
  const title = input.title.trim();
  if (!title) throw new Error('빈 제목으로 할 일을 만들 수 없어요.');

  const insert = domainTaskToDbInsert({ ...input, title }, userId);
  const { data, error } = await client
    .from('tasks')
    .insert(insert)
    .select('*')
    .single();
  if (error) throw error;
  return dbTaskToDomain(data as DbTaskRow, []);
}

const TASK_PATCH_KEYS = [
  'title',
  'notes',
  'priority',
  'category',
  'due',
  'starred',
  'done',
] as const;
type TaskPatchKey = (typeof TASK_PATCH_KEYS)[number];

export async function updateTask(
  client: SupabaseClient,
  taskId: string,
  patch: Partial<Pick<Task, TaskPatchKey>>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {};
  for (const k of TASK_PATCH_KEYS) {
    if (patch[k] !== undefined) {
      payload[k] = k === 'due' ? (patch.due === '' ? null : patch.due) : patch[k];
    }
  }
  if (Object.keys(payload).length === 0) return; // empty patch → no-op
  const { error } = await client.from('tasks').update(payload).eq('id', taskId);
  if (error) throw error;
}

export async function deleteTask(
  client: SupabaseClient,
  taskId: string,
): Promise<void> {
  const { error } = await client.from('tasks').delete().eq('id', taskId);
  if (error) throw error;
}

export async function toggleTaskDone(
  client: SupabaseClient,
  taskId: string,
  done: boolean,
): Promise<void> {
  return updateTask(client, taskId, { done });
}

export async function toggleTaskStarred(
  client: SupabaseClient,
  taskId: string,
  starred: boolean,
): Promise<void> {
  return updateTask(client, taskId, { starred });
}
