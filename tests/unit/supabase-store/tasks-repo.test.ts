import { describe, it, expect, vi } from 'vitest';
import { listTasksForUser, loadPreferences } from '@/lib/supabase-store/tasks-repo';
import { makeChain, makeClient } from '../../helpers/supabase-mock';

const USER = '00000000-0000-0000-0000-000000000001';

describe('listTasksForUser', () => {
  it('joins tasks + subtasks into the domain Task[] shape, sorted by created_at desc', async () => {
    const tasksData = [
      {
        id: 't2',
        user_id: USER,
        title: 'newer',
        due: '2026-05-20',
        priority: 'med',
        category: 'dev',
        starred: false,
        done: false,
        notes: '',
        created_at: '2026-05-15T10:00:00Z',
        updated_at: '2026-05-15T10:00:00Z',
      },
      {
        id: 't1',
        user_id: USER,
        title: 'older',
        due: null,
        priority: 'none',
        category: 'design',
        starred: true,
        done: false,
        notes: '',
        created_at: '2026-05-14T10:00:00Z',
        updated_at: '2026-05-14T10:00:00Z',
      },
    ];
    const subsData = [
      {
        id: 's1',
        task_id: 't2',
        user_id: USER,
        text: 'sub of t2 (later)',
        done: false,
        sort_order: 1,
        created_at: '',
        updated_at: '',
      },
      {
        id: 's2',
        task_id: 't2',
        user_id: USER,
        text: 'sub of t2 (earlier)',
        done: true,
        sort_order: 0,
        created_at: '',
        updated_at: '',
      },
    ];

    const client = makeClient({
      tasks: { data: tasksData, error: null },
      subtasks: { data: subsData, error: null },
    });

    const result = await listTasksForUser(client as any, USER);
    expect(result.map((t) => t.id)).toEqual(['t2', 't1']);
    expect(result[0].due).toBe('2026-05-20');
    expect(result[1].due).toBe(''); // null → ''
    expect(result[0].subs.map((s) => s.id)).toEqual(['s2', 's1']); // sort_order asc
    expect(result[1].subs).toEqual([]);
  });

  it('returns an empty array when the user has no tasks', async () => {
    const client = makeClient({
      tasks: { data: [], error: null },
      subtasks: { data: [], error: null },
    });
    expect(await listTasksForUser(client as any, USER)).toEqual([]);
  });

  it('throws when the tasks query returns an error', async () => {
    const client = makeClient({
      tasks: { data: null, error: { message: 'PG-out' } },
    });
    await expect(listTasksForUser(client as any, USER)).rejects.toThrow();
  });
});

describe('loadPreferences', () => {
  it('maps a stored row to the domain UserPreference', async () => {
    const client = makeClient({
      user_preferences: {
        data: {
          user_id: USER,
          view: 'today',
          sort: 'due_asc',
          theme: 'dark',
          seeded_at: null,
          updated_at: '',
        },
        error: null,
      },
    });
    expect(await loadPreferences(client as any, USER)).toEqual({
      view: 'today',
      sort: 'due_asc',
      theme: 'dark',
    });
  });

  it('returns defaults when no row exists yet', async () => {
    const client = makeClient({
      user_preferences: { data: null, error: null },
    });
    expect(await loadPreferences(client as any, USER)).toEqual({
      view: 'inbox',
      sort: 'created_desc',
      theme: 'light',
    });
  });
});
