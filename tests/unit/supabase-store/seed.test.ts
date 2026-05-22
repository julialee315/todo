import { describe, it, expect, vi } from 'vitest';
import { ensureSeed } from '@/lib/supabase-store/seed';
import { SAMPLE_TASKS } from '@/lib/store/sample-data';
import { makeChain, makeClient } from '../../helpers/supabase-mock';

const USER = '00000000-0000-0000-0000-000000000001';

describe('ensureSeed', () => {
  it('skips work when user_preferences.seeded_at is already set', async () => {
    const client = makeClient({
      user_preferences: { data: { seeded_at: '2026-05-15T00:00:00Z' }, error: null },
    });
    await ensureSeed(client as any, USER);
    expect(client.from).toHaveBeenCalledWith('user_preferences');
    expect(client.from).not.toHaveBeenCalledWith('tasks');
    expect(client.from).not.toHaveBeenCalledWith('subtasks');
  });

  it('inserts SAMPLE_TASKS + subtasks and marks seeded_at when none exists', async () => {
    const insertedTaskRows = SAMPLE_TASKS.map((t, i) => ({
      id: `inserted-${i}`,
      title: t.title,
    }));

    // Build per-call chains so prefs check and the two inserts each see their own chain.
    let prefCall = 0;
    const client = makeClient({
      user_preferences: () => {
        prefCall += 1;
        // 1st call: maybeSingle for the seeded_at check → returns null
        // 2nd call: upsert → returns success
        return prefCall === 1
          ? makeChain({ data: null, error: null })
          : makeChain({ data: null, error: null });
      },
      tasks: () => makeChain({ data: insertedTaskRows, error: null }),
      subtasks: () => makeChain({ data: null, error: null }),
    });

    await ensureSeed(client as any, USER);

    // The check came first
    expect(client.from).toHaveBeenNthCalledWith(1, 'user_preferences');
    // Tasks insert
    const taskCalls = (client.from as any).mock.calls.filter((c: any[]) => c[0] === 'tasks');
    expect(taskCalls.length).toBeGreaterThan(0);
    // Subtasks insert (only if at least one task in SAMPLE_TASKS has subs)
    const hasSubs = SAMPLE_TASKS.some((t) => (t.subs ?? []).length > 0);
    const subCalls = (client.from as any).mock.calls.filter((c: any[]) => c[0] === 'subtasks');
    expect(subCalls.length > 0).toBe(hasSubs);
    // Final preferences upsert
    expect((client.from as any).mock.calls.at(-1)?.[0]).toBe('user_preferences');
  });

  it('does not throw when concurrent first-login causes the preferences upsert to conflict', async () => {
    // Simulate: the seeded_at check returns null, then the inserts succeed,
    // but the upsert fails because a parallel session already wrote the row.
    let prefCall = 0;
    const client = makeClient({
      user_preferences: () => {
        prefCall += 1;
        if (prefCall === 1) return makeChain({ data: null, error: null });
        return makeChain({ data: null, error: { code: '23505', message: 'duplicate key' } });
      },
      tasks: () => makeChain({ data: [{ id: 't' }], error: null }),
      subtasks: () => makeChain({ data: null, error: null }),
    });
    await expect(ensureSeed(client as any, USER)).resolves.toBeUndefined();
  });
});
