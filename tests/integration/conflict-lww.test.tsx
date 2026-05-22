import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import type { DbTaskRow, Task } from '@/lib/types';

// US3 acceptance #3: concurrent updates from two sessions converge on the
// last write. Postgres serializes the writes; Realtime then delivers each
// session the final state. We model that here by firing two UPDATE events
// in sequence — whichever lands second wins, and the local reducer follows.

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ from: vi.fn(), auth: {}, channel: vi.fn() }),
}));

const realtime = vi.hoisted(() => ({
  current: null as ((c: any) => void) | null,
  stop: vi.fn(),
}));
vi.mock('@/lib/supabase-store/realtime', () => ({
  subscribeToUserChanges: vi.fn((_c: any, _u: string, cb: (x: any) => void) => {
    realtime.current = cb;
    return realtime.stop;
  }),
}));

vi.mock('@/lib/supabase-store/seed', () => ({
  ensureSeed: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase-store/tasks-repo', () => ({
  listTasksForUser: vi.fn(async () => [
    {
      id: 't1',
      title: 'baseline',
      due: '',
      priority: 'none',
      category: 'dev',
      starred: false,
      done: false,
      notes: '',
      subs: [],
    } satisfies Task,
  ]),
  loadPreferences: vi.fn(async () => ({
    view: 'inbox',
    sort: 'created_desc',
    theme: 'light',
  })),
}));
vi.mock('@/lib/supabase-store/tasks-mutations', () => ({
  addTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  toggleTaskDone: vi.fn(),
  toggleTaskStarred: vi.fn(),
}));
vi.mock('@/lib/supabase-store/subtasks', () => ({
  addSubtask: vi.fn(),
  updateSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
}));
vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u-1', email: 'a@b.c' }, loading: false, signOut: vi.fn() }),
}));

import { TasksProvider, useTasks } from '@/context/TasksProvider';

function Probe() {
  const { tasks } = useTasks();
  return <span data-testid="title">{tasks[0]?.title ?? '없음'}</span>;
}

function dbTask(title: string, updated_at: string): DbTaskRow {
  return {
    id: 't1',
    user_id: 'u-1',
    title,
    due: null,
    priority: 'none',
    category: 'dev',
    starred: false,
    done: false,
    notes: '',
    created_at: '',
    updated_at,
  };
}

beforeEach(() => {
  realtime.current = null;
  realtime.stop.mockClear();
});

describe('US3 last-write-wins', () => {
  it('the later UPDATE event is the final state both sessions see', async () => {
    render(
      <TasksProvider>
        <Probe />
      </TasksProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('title')).toHaveTextContent('baseline'),
    );

    // Session A's write arrives at T1.
    act(() => {
      realtime.current!({
        table: 'tasks',
        event: 'UPDATE',
        new: dbTask('from session A', '2026-05-22T12:00:00.000Z'),
        old: dbTask('baseline', '2026-05-22T11:59:00.000Z'),
      });
    });
    expect(screen.getByTestId('title')).toHaveTextContent('from session A');

    // Session B's write arrives next (later DB write order); both sessions
    // converge to B's value.
    act(() => {
      realtime.current!({
        table: 'tasks',
        event: 'UPDATE',
        new: dbTask('from session B', '2026-05-22T12:00:01.000Z'),
        old: dbTask('from session A', '2026-05-22T12:00:00.000Z'),
      });
    });
    expect(screen.getByTestId('title')).toHaveTextContent('from session B');
  });
});
