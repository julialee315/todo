import { describe, it, expect, vi } from 'vitest';
import { ensureSeed } from '@/lib/supabase-store/seed';
import { SAMPLE_TASKS } from '@/lib/store/sample-data';
import { makeChain, makeClient } from '../../helpers/supabase-mock';

const USER = '00000000-0000-0000-0000-000000000001';

describe('ensureSeed (atomic claim)', () => {
  it('runs the full seed when the atomic claim returns a row', async () => {
    // First user_preferences call (upsert) → ok. Second call (UPDATE claim)
    // → returns one row (we won the race). Then tasks INSERT + subtasks
    // INSERT, both succeed.
    let prefCall = 0;
    const client = makeClient({
      user_preferences: () => {
        prefCall += 1;
        if (prefCall === 1) return makeChain({ data: null, error: null }); // upsert
        // claim UPDATE returns one row
        return makeChain({ data: [{ user_id: USER }], error: null });
      },
      tasks: () =>
        makeChain({
          data: SAMPLE_TASKS.map((_, i) => ({ id: `id-${i}`, title: '' })),
          error: null,
        }),
      subtasks: () => makeChain({ data: null, error: null }),
    });

    await ensureSeed(client as any, USER);

    // upsert + claim + tasks insert + subs insert (only if any sub exists)
    const fromCalls = (client.from as any).mock.calls.map((c: any[]) => c[0]);
    expect(fromCalls.filter((t: string) => t === 'user_preferences').length).toBe(2);
    expect(fromCalls).toContain('tasks');
    const hasSubs = SAMPLE_TASKS.some((t) => (t.subs ?? []).length > 0);
    expect(fromCalls.includes('subtasks')).toBe(hasSubs);
  });

  it('skips the seed work when the atomic claim returns zero rows (race loser)', async () => {
    // Concurrent caller already flipped seeded_at, so the UPDATE matches
    // nothing for this caller.
    let prefCall = 0;
    const client = makeClient({
      user_preferences: () => {
        prefCall += 1;
        if (prefCall === 1) return makeChain({ data: null, error: null });
        return makeChain({ data: [], error: null }); // lost the race
      },
    });

    await ensureSeed(client as any, USER);

    const fromCalls = (client.from as any).mock.calls.map((c: any[]) => c[0]);
    expect(fromCalls.filter((t: string) => t === 'user_preferences').length).toBe(2);
    expect(fromCalls).not.toContain('tasks');
    expect(fromCalls).not.toContain('subtasks');
  });

  it('tolerates a 23505 from the initial preferences upsert (row already exists)', async () => {
    // ignoreDuplicates means supabase-js returns the conflict in `error` as
    // 23505 but the row exists fine. ensureSeed should swallow it and
    // proceed to the claim.
    let prefCall = 0;
    const client = makeClient({
      user_preferences: () => {
        prefCall += 1;
        if (prefCall === 1) {
          return makeChain({ data: null, error: { code: '23505', message: 'dup' } });
        }
        return makeChain({ data: [{ user_id: USER }], error: null });
      },
      tasks: () =>
        makeChain({ data: SAMPLE_TASKS.map((_, i) => ({ id: `id-${i}`, title: '' })), error: null }),
      subtasks: () => makeChain({ data: null, error: null }),
    });

    await expect(ensureSeed(client as any, USER)).resolves.toBeUndefined();
  });

  it('rolls seeded_at back to null if the task INSERT fails', async () => {
    // Claim succeeds → tasks INSERT fails. The marker should be cleared so
    // the next mount can retry instead of being permanently stuck.
    let prefCall = 0;
    const updateSpies: any[] = [];
    const client = makeClient({
      user_preferences: () => {
        prefCall += 1;
        if (prefCall === 1) return makeChain({ data: null, error: null });
        if (prefCall === 2) {
          const c = makeChain({ data: [{ user_id: USER }], error: null });
          updateSpies.push(c);
          return c;
        }
        // 3rd call is the rollback UPDATE
        const c = makeChain({ data: null, error: null });
        updateSpies.push(c);
        return c;
      },
      tasks: () => makeChain({ data: null, error: { code: '23503', message: 'fk' } }),
    });

    await expect(ensureSeed(client as any, USER)).rejects.toBeTruthy();

    // The rollback UPDATE used update({ seeded_at: null })
    expect(updateSpies[1].update).toHaveBeenCalledWith({ seeded_at: null });
  });
});
