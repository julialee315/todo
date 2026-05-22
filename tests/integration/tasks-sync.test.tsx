import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import type { DbSubtaskRow, DbTaskRow, Task } from '@/lib/types';

// Same-user, two-session realtime sync (US3). We mount one TasksProvider,
// hydrate it, then drive the realtime channel by hand to simulate a change
// arriving from a sibling tab/device. The local reducer's id-based dedup
// also covers the "echo of our own write" case.

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ from: vi.fn(), auth: {}, channel: vi.fn() }),
}));

// Capture the realtime onChange callback so each test can fire payloads
// against it directly.
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

const adapter = vi.hoisted(() => ({
  ensureSeed: vi.fn(async () => undefined),
  listTasksForUser: vi.fn<(...a: any[]) => Promise<Task[]>>(async () => [] as Task[]),
  addTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  toggleTaskDone: vi.fn(),
  toggleTaskStarred: vi.fn(),
  addSubtask: vi.fn(),
  updateSubtask: vi.fn(),
  deleteSubtask: vi.fn(),
}));
vi.mock('@/lib/supabase-store/seed', () => ({ ensureSeed: adapter.ensureSeed }));
vi.mock('@/lib/supabase-store/tasks-repo', () => ({
  listTasksForUser: adapter.listTasksForUser,
  loadPreferences: vi.fn(async () => ({
    view: 'inbox',
    sort: 'created_desc',
    theme: 'light',
  })),
}));
vi.mock('@/lib/supabase-store/tasks-mutations', () => ({
  addTask: adapter.addTask,
  updateTask: adapter.updateTask,
  deleteTask: adapter.deleteTask,
  toggleTaskDone: adapter.toggleTaskDone,
  toggleTaskStarred: adapter.toggleTaskStarred,
}));
vi.mock('@/lib/supabase-store/subtasks', () => ({
  addSubtask: adapter.addSubtask,
  updateSubtask: adapter.updateSubtask,
  deleteSubtask: adapter.deleteSubtask,
}));
vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u-1', email: 'a@b.c' }, loading: false, signOut: vi.fn() }),
}));

import { TasksProvider, useTasks } from '@/context/TasksProvider';

function Probe() {
  const { tasks } = useTasks();
  return (
    <ul data-testid="titles">
      {tasks.map((t) => (
        <li key={t.id}>
          <span data-testid={`title-${t.id}`}>{t.title}</span>
          <span data-testid={`subs-${t.id}`}>
            {t.subs.map((s) => s.text).join(',')}
          </span>
        </li>
      ))}
    </ul>
  );
}

function existing(): Task[] {
  return [
    {
      id: 't1',
      title: 'first',
      due: '',
      priority: 'none',
      category: 'dev',
      starred: false,
      done: false,
      notes: '',
      subs: [{ id: 's1', text: 'sub-1', done: false }],
    },
  ];
}

function dbTask(o: Partial<DbTaskRow> = {}): DbTaskRow {
  return {
    id: 't1',
    user_id: 'u-1',
    title: 'first',
    due: null,
    priority: 'none',
    category: 'dev',
    starred: false,
    done: false,
    notes: '',
    created_at: '',
    updated_at: '',
    ...o,
  };
}

function dbSub(o: Partial<DbSubtaskRow> = {}): DbSubtaskRow {
  return {
    id: 's-new',
    task_id: 't1',
    user_id: 'u-1',
    text: 'remote sub',
    done: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...o,
  };
}

beforeEach(() => {
  realtime.current = null;
  realtime.stop.mockClear();
  for (const fn of Object.values(adapter)) (fn as any).mockReset();
  adapter.listTasksForUser.mockResolvedValue(existing());
  localStorage.clear();
});

async function mount() {
  render(
    <TasksProvider>
      <Probe />
    </TasksProvider>,
  );
  await waitFor(() => expect(screen.getByTestId('title-t1')).toBeInTheDocument());
}

describe('US3 realtime — task channel', () => {
  it('a remote INSERT appears in this session without a refetch', async () => {
    await mount();
    act(() => {
      realtime.current!({
        table: 'tasks',
        event: 'INSERT',
        new: dbTask({ id: 't2', title: 'from another tab' }),
        old: null,
      });
    });
    expect(screen.getByTestId('title-t2')).toHaveTextContent('from another tab');
  });

  it('a remote UPDATE patches an existing task in place', async () => {
    await mount();
    act(() => {
      realtime.current!({
        table: 'tasks',
        event: 'UPDATE',
        new: dbTask({ title: 'edited remotely' }),
        old: dbTask(),
      });
    });
    expect(screen.getByTestId('title-t1')).toHaveTextContent('edited remotely');
  });

  it('a remote DELETE removes the task', async () => {
    await mount();
    act(() => {
      realtime.current!({
        table: 'tasks',
        event: 'DELETE',
        new: null,
        old: dbTask(),
      });
    });
    expect(screen.queryByTestId('title-t1')).not.toBeInTheDocument();
  });
});

describe('US3 realtime — subtask channel', () => {
  it('a remote subtask INSERT lands on the right parent', async () => {
    await mount();
    act(() => {
      realtime.current!({
        table: 'subtasks',
        event: 'INSERT',
        new: dbSub({ text: 'remote sub' }),
        old: null,
      });
    });
    expect(screen.getByTestId('subs-t1')).toHaveTextContent('sub-1,remote sub');
  });
});

describe('US3 realtime — echo dedupe', () => {
  it('an INSERT echo of an existing task is a no-op', async () => {
    await mount();
    const before = screen.getByTestId('title-t1').textContent;
    act(() => {
      realtime.current!({
        table: 'tasks',
        event: 'INSERT',
        new: dbTask({ id: 't1', title: 'echo' }),
        old: null,
      });
    });
    // The reducer's add-dedupe kept the original title.
    expect(screen.getByTestId('title-t1').textContent).toBe(before);
  });
});
