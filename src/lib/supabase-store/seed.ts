// Seed the first-time user with the SAMPLE_TASKS corpus, idempotently.
//
// Idempotency is anchored on user_preferences.seeded_at: if it's set, we
// return early. Otherwise we insert the 14 sample tasks, their subtasks, and
// flip seeded_at to now(). If two tabs first-login in parallel, one of them
// will see seeded_at populated (skip) or hit a duplicate-key error on upsert
// (swallowed) — either way we don't double-seed.
//
// Contract: specs/002-cloud-sync-multiuser/contracts/db-schema.md §5.

import type { SupabaseClient } from '@supabase/supabase-js';
import { SAMPLE_TASKS } from '@/lib/store/sample-data';

export async function ensureSeed(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  const { data: pref } = await client
    .from('user_preferences')
    .select('seeded_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (pref?.seeded_at) return;

  // 1) Insert the 14 tasks. The DB returns them with their fresh ids so we
  //    can attach subtasks. We keep the SAMPLE_TASKS order so subs map by
  //    index — simpler than a title-join.
  const taskRows = SAMPLE_TASKS.map((t) => ({
    user_id: userId,
    title: t.title,
    due: t.due || null,
    priority: t.priority,
    category: t.category,
    starred: t.starred,
    done: t.done,
    notes: t.notes,
  }));
  const { data: inserted, error: taskErr } = await client
    .from('tasks')
    .insert(taskRows)
    .select('id, title');
  if (taskErr) throw taskErr;

  // 2) Insert all subtasks in one batch. user_id is set by the BEFORE
  //    INSERT trigger from the parent task.
  const subRows = SAMPLE_TASKS.flatMap((t, idx) =>
    (t.subs ?? []).map((s, j) => ({
      task_id: (inserted ?? [])[idx]?.id,
      text: s.text,
      done: s.done,
      sort_order: j,
    })),
  ).filter((r) => r.task_id);
  if (subRows.length) {
    const { error: subErr } = await client.from('subtasks').insert(subRows);
    if (subErr) throw subErr;
  }

  // 3) Mark seeded. A 23505 (unique violation) from a parallel session is
  //    fine — somebody else already marked it.
  const { error: prefErr } = await client
    .from('user_preferences')
    .upsert({ user_id: userId, seeded_at: new Date().toISOString() });
  if (prefErr && prefErr.code !== '23505') throw prefErr;
}
