// Bidirectional mappers between Supabase row shapes and the local domain
// types. The rest of the app (reducer, components, selectors) only ever sees
// domain types — these functions are the single source of conversion.
//
// Contract: specs/002-cloud-sync-multiuser/contracts/store-api.md §8.
// Tests: tests/unit/supabase-store/mappers.test.ts.

import type {
  DbPreferenceRow,
  DbPreferenceUpsert,
  DbSubtaskInsert,
  DbSubtaskRow,
  DbTaskInsert,
  DbTaskRow,
  Subtask,
  Task,
  UserPreference,
} from '@/lib/types';

export function dbTaskToDomain(row: DbTaskRow, subs: DbSubtaskRow[]): Task {
  return {
    id: row.id,
    title: row.title,
    due: row.due ?? '',
    priority: row.priority,
    category: row.category,
    starred: row.starred,
    done: row.done,
    notes: row.notes,
    subs: [...subs]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(dbSubtaskToDomain),
  };
}

/** Build an insert payload, omitting any field the caller did not pass so DB
 *  defaults apply. `due: ''` becomes SQL NULL. */
export function domainTaskToDbInsert(
  patch: Partial<Task>,
  userId: string,
): DbTaskInsert {
  const out: DbTaskInsert = { user_id: userId, title: patch.title ?? '' };
  if (patch.due !== undefined) out.due = patch.due === '' ? null : patch.due;
  if (patch.priority !== undefined) out.priority = patch.priority;
  if (patch.category !== undefined) out.category = patch.category;
  if (patch.starred !== undefined) out.starred = patch.starred;
  if (patch.done !== undefined) out.done = patch.done;
  if (patch.notes !== undefined) out.notes = patch.notes;
  return out;
}

export function dbSubtaskToDomain(row: DbSubtaskRow): Subtask {
  return { id: row.id, text: row.text, done: row.done };
}

/** Build a subtask insert payload. user_id is intentionally NOT set — the
 *  BEFORE INSERT trigger derives it from the parent task. */
export function domainSubtaskToDbInsert(
  patch: Partial<Subtask> & { sort_order?: number },
  taskId: string,
): DbSubtaskInsert {
  const out: DbSubtaskInsert = { task_id: taskId, text: patch.text ?? '' };
  if (patch.done !== undefined) out.done = patch.done;
  if (patch.sort_order !== undefined) out.sort_order = patch.sort_order;
  return out;
}

export function dbPreferenceToDomain(row: DbPreferenceRow): UserPreference {
  return { view: row.view, sort: row.sort, theme: row.theme };
}

export function domainPreferenceToDbUpsert(
  patch: Partial<UserPreference>,
  userId: string,
): DbPreferenceUpsert {
  const out: DbPreferenceUpsert = { user_id: userId };
  if (patch.view !== undefined) out.view = patch.view;
  if (patch.sort !== undefined) out.sort = patch.sort;
  if (patch.theme !== undefined) out.theme = patch.theme;
  return out;
}
