import { describe, it, expect, vi } from 'vitest';
import { subscribeToUserChanges } from '@/lib/supabase-store/realtime';
import type { DbSubtaskRow, DbTaskRow, RealtimeChange } from '@/lib/types';

// Build a fake supabase client whose .channel() returns a chainable mock so
// the adapter can register postgres_changes handlers without a network. We
// expose the registered handlers so each test can drive them with a synthetic
// payload.

function makeFakeClient() {
  type Handler = (payload: any) => void;
  const handlersByTable = new Map<string, Handler>();
  const unsubscribe = vi.fn();
  const channelObj: any = {};
  channelObj.on = vi.fn(
    (_event: string, opts: { table: string }, cb: Handler) => {
      handlersByTable.set(opts.table, cb);
      return channelObj;
    },
  );
  channelObj.subscribe = vi.fn(() => channelObj);
  channelObj.unsubscribe = unsubscribe;
  const channel = vi.fn(() => channelObj);
  return {
    client: { channel } as any,
    channel,
    channelObj,
    unsubscribe,
    fire(table: string, payload: any) {
      const cb = handlersByTable.get(table);
      if (!cb) throw new Error(`no handler for ${table}`);
      cb(payload);
    },
  };
}

const USER = '00000000-0000-0000-0000-000000000001';

function dbTask(overrides: Partial<DbTaskRow> = {}): DbTaskRow {
  return {
    id: 't1',
    user_id: USER,
    title: '제목',
    due: null,
    priority: 'none',
    category: 'dev',
    starred: false,
    done: false,
    notes: '',
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

function dbSub(overrides: Partial<DbSubtaskRow> = {}): DbSubtaskRow {
  return {
    id: 's1',
    task_id: 't1',
    user_id: USER,
    text: '서브',
    done: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('subscribeToUserChanges', () => {
  it('opens a single channel named for the user and binds the 3 table handlers', () => {
    const f = makeFakeClient();
    subscribeToUserChanges(f.client, USER, vi.fn());
    expect(f.channel).toHaveBeenCalledTimes(1);
    // Channel name carries the user id plus a per-call random suffix so two
    // callers (TasksProvider + ThemeProvider) don't collide on the same name.
    const channelName = (f.channel as any).mock.calls[0][0];
    expect(channelName).toMatch(new RegExp(`^tasks-by-user-${USER}-[a-z0-9]{6}$`));
    expect(f.channelObj.on).toHaveBeenCalledTimes(3);
    const tables = (f.channelObj.on as any).mock.calls.map(
      (c: any[]) => c[1]?.table,
    );
    expect(tables).toEqual(
      expect.arrayContaining(['tasks', 'subtasks', 'user_preferences']),
    );
    expect(f.channelObj.subscribe).toHaveBeenCalled();
  });

  it('every binding scopes its filter to the caller’s user_id', () => {
    const f = makeFakeClient();
    subscribeToUserChanges(f.client, USER, vi.fn());
    for (const call of (f.channelObj.on as any).mock.calls) {
      expect(call[1].filter).toBe(`user_id=eq.${USER}`);
      expect(call[1].schema).toBe('public');
    }
  });

  it('returns an unsubscribe function that closes the channel', () => {
    const f = makeFakeClient();
    const stop = subscribeToUserChanges(f.client, USER, vi.fn());
    stop();
    expect(f.unsubscribe).toHaveBeenCalled();
  });
});

describe('postgres_changes payload → RealtimeChange', () => {
  it('forwards a task INSERT', () => {
    const f = makeFakeClient();
    const seen: RealtimeChange[] = [];
    subscribeToUserChanges(f.client, USER, (c) => seen.push(c));
    f.fire('tasks', { eventType: 'INSERT', new: dbTask({ id: 'new' }), old: null });
    expect(seen).toEqual([
      expect.objectContaining({
        table: 'tasks',
        event: 'INSERT',
        new: expect.objectContaining({ id: 'new' }),
        old: null,
      }),
    ]);
  });

  it('forwards a task UPDATE with both new and old rows', () => {
    const f = makeFakeClient();
    const seen: RealtimeChange[] = [];
    subscribeToUserChanges(f.client, USER, (c) => seen.push(c));
    f.fire('tasks', {
      eventType: 'UPDATE',
      new: dbTask({ title: 'after' }),
      old: dbTask({ title: 'before' }),
    });
    expect(seen[0]).toMatchObject({
      table: 'tasks',
      event: 'UPDATE',
      new: { title: 'after' },
      old: { title: 'before' },
    });
  });

  it('forwards a task DELETE (new is null)', () => {
    const f = makeFakeClient();
    const seen: RealtimeChange[] = [];
    subscribeToUserChanges(f.client, USER, (c) => seen.push(c));
    f.fire('tasks', { eventType: 'DELETE', new: null, old: dbTask() });
    expect(seen[0]).toMatchObject({
      table: 'tasks',
      event: 'DELETE',
      new: null,
      old: expect.objectContaining({ id: 't1' }),
    });
  });

  it('forwards subtasks and user_preferences events', () => {
    const f = makeFakeClient();
    const seen: RealtimeChange[] = [];
    subscribeToUserChanges(f.client, USER, (c) => seen.push(c));
    f.fire('subtasks', { eventType: 'INSERT', new: dbSub(), old: null });
    f.fire('user_preferences', {
      eventType: 'UPDATE',
      new: {
        user_id: USER,
        view: 'today',
        sort: 'priority',
        theme: 'dark',
        seeded_at: null,
        updated_at: '',
      },
      old: {
        user_id: USER,
        view: 'inbox',
        sort: 'created_desc',
        theme: 'light',
        seeded_at: null,
        updated_at: '',
      },
    });
    expect(seen.map((c) => c.table)).toEqual(['subtasks', 'user_preferences']);
  });
});
