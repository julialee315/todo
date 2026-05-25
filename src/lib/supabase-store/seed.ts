// Seed the first-time user with the SAMPLE_TASKS corpus, idempotently.
//
// The idempotency guard has to be *atomic*: React 18 Strict Mode (dev) and
// fast network round-trips can fire two or three concurrent ensureSeed()
// calls before any of them has finished writing the `seeded_at` marker. A
// naive "SELECT then INSERT" check races: all three callers read NULL,
// each inserts 14 tasks, and the user ends up with 42.
//
// The fix is to claim the seed slot with a single conditional UPDATE:
//
//   UPDATE user_preferences SET seeded_at = now()
//     WHERE user_id = $1 AND seeded_at IS NULL
//     RETURNING user_id;
//
// Postgres serializes that statement, so exactly one caller sees an
// affected row. The losers see zero rows and bail before touching `tasks`.
//
// Contract: specs/002-cloud-sync-multiuser/contracts/db-schema.md §5.

import type { SupabaseClient } from '@supabase/supabase-js';
import { SAMPLE_TASKS } from '@/lib/store/sample-data';

export async function ensureSeed(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  // 1. Make sure the preferences row exists. ignoreDuplicates so concurrent
  //    callers don't error on the PK; we don't care who wrote it.
  const { error: insertErr } = await client
    .from('user_preferences')
    .upsert(
      { user_id: userId },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
  if (insertErr && insertErr.code !== '23505') throw insertErr;

  // 2. Atomic claim — only the caller whose UPDATE actually flips
  //    seeded_at from NULL to now() proceeds. Concurrent callers get an
  //    empty `data` array (the WHERE clause matches nothing for them).
  const { data: claimed, error: claimErr } = await client
    .from('user_preferences')
    .update({ seeded_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('seeded_at', null)
    .select('user_id');
  if (claimErr) throw claimErr;
  if (!claimed || claimed.length === 0) return; // lost the race — already seeded

  // 3. Bulk insert the 14 sample tasks.
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
  if (taskErr) {
    // Roll the marker back so the next mount can retry cleanly.
    await client
      .from('user_preferences')
      .update({ seeded_at: null })
      .eq('user_id', userId);
    throw taskErr;
  }

  // 4. Bulk insert subtasks. user_id is set by the BEFORE INSERT trigger.
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
}
