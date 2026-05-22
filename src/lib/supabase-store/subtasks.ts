// Write adapters for subtasks. user_id is never set on insert — the
// BEFORE INSERT trigger derives it from the parent task. This is also the
// reason we keep `subtasks_enforce_user_id_trg` in the schema.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DbSubtaskRow, Subtask } from '@/lib/types';
import {
  dbSubtaskToDomain,
  domainSubtaskToDbInsert,
} from '@/lib/supabase-store/mappers';

export async function addSubtask(
  client: SupabaseClient,
  taskId: string,
  text: string,
): Promise<Subtask> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('빈 서브태스크는 만들 수 없어요.');

  const insert = domainSubtaskToDbInsert({ text: trimmed }, taskId);
  const { data, error } = await client
    .from('subtasks')
    .insert(insert)
    .select('*')
    .single();
  if (error) throw error;
  return dbSubtaskToDomain(data as DbSubtaskRow);
}

const SUB_PATCH_KEYS = ['text', 'done'] as const;
type SubPatchKey = (typeof SUB_PATCH_KEYS)[number];

export async function updateSubtask(
  client: SupabaseClient,
  subtaskId: string,
  patch: Partial<Pick<Subtask, SubPatchKey>>,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {};
  for (const k of SUB_PATCH_KEYS) {
    if (patch[k] !== undefined) payload[k] = patch[k];
  }
  if (Object.keys(payload).length === 0) return;
  const { error } = await client
    .from('subtasks')
    .update(payload)
    .eq('id', subtaskId);
  if (error) throw error;
}

export async function deleteSubtask(
  client: SupabaseClient,
  subtaskId: string,
): Promise<void> {
  const { error } = await client
    .from('subtasks')
    .delete()
    .eq('id', subtaskId);
  if (error) throw error;
}
