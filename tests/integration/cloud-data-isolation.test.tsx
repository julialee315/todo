import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { Task } from '@/lib/types';

// Two-user integration: User A sees their own list; flipping the auth user
// to B re-fetches and shows a completely different list. A mutation against
// what looks like A's task ID, while signed in as B, lands in the adapter
// but the (mocked) RLS layer returns 0 affected rows.

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ from: vi.fn(), auth: {} }),
}));

const tasksByUser: Record<string, Task[]> = {
  'user-a': [
    {
      id: 't-a1',
      title: 'A의 비공개 할 일',
      due: '',
      priority: 'high',
      category: 'dev',
      starred: true,
      done: false,
      notes: '',
      subs: [],
    },
  ],
  'user-b': [
    {
      id: 't-b1',
      title: 'B의 별개 할 일',
      due: '',
      priority: 'low',
      category: 'design',
      starred: false,
      done: false,
      notes: '',
      subs: [],
    },
  ],
};

const adapter = vi.hoisted(() => ({
  ensureSeed: vi.fn(async () => undefined),
  listTasksForUser: vi.fn<(...a: any[]) => Promise<Task[]>>(),
  addTask: vi.fn(),
  // RLS simulation: updateTask on a task that the current user does not own
  // is silently a no-op (matches Supabase behaviour — 0 rows affected, no
  // error). We track the call to assert it was made and produced nothing.
  updateTask: vi.fn(async () => undefined),
  deleteTask: vi.fn(async () => undefined),
  toggleTaskDone: vi.fn(async () => undefined),
  toggleTaskStarred: vi.fn(async () => undefined),
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
vi.mock('@/lib/supabase-store/realtime', () => ({
  subscribeToUserChanges: vi.fn(() => () => {}),
}));

const auth = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
}));
vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ user: auth.user, loading: false, signOut: vi.fn() }),
}));

import { TasksProvider, useTasks } from '@/context/TasksProvider';

function TaskTitles() {
  const { tasks } = useTasks();
  return (
    <ul data-testid="titles">
      {tasks.map((t) => (
        <li key={t.id}>{t.title}</li>
      ))}
    </ul>
  );
}

function Probe() {
  const { updateTask } = useTasks();
  return (
    <button
      onClick={() =>
        void updateTask('t-a1', { title: '훔치려는 시도' }).catch(() => {})
      }
    >
      try-steal
    </button>
  );
}

function App({ children }: { children: ReactNode }) {
  return <TasksProvider>{children}</TasksProvider>;
}

beforeEach(() => {
  auth.user = null;
  adapter.listTasksForUser.mockReset().mockImplementation(async (_c, id: string) => {
    return tasksByUser[id] ?? [];
  });
  for (const fn of [
    adapter.ensureSeed,
    adapter.addTask,
    adapter.updateTask,
    adapter.deleteTask,
    adapter.toggleTaskDone,
    adapter.toggleTaskStarred,
    adapter.addSubtask,
    adapter.updateSubtask,
    adapter.deleteSubtask,
  ])
    (fn as any).mockClear();
  localStorage.clear();
});

describe('Cloud data isolation', () => {
  it('shows only the current user’s tasks; switching identities loads a different list', async () => {
    auth.user = { id: 'user-a', email: 'a@x.x' };
    const { rerender } = render(
      <App>
        <TaskTitles />
      </App>,
    );

    await waitFor(() =>
      expect(screen.getByText('A의 비공개 할 일')).toBeInTheDocument(),
    );
    expect(screen.queryByText('B의 별개 할 일')).not.toBeInTheDocument();

    // Identity switch — rerender so the AuthProvider mock returns the new id.
    auth.user = { id: 'user-b', email: 'b@x.x' };
    rerender(
      <App>
        <TaskTitles />
      </App>,
    );

    await waitFor(() =>
      expect(screen.getByText('B의 별개 할 일')).toBeInTheDocument(),
    );
    expect(screen.queryByText('A의 비공개 할 일')).not.toBeInTheDocument();
  });

  it('cross-user mutations resolve to no-op (RLS silently blocks them)', async () => {
    auth.user = { id: 'user-b', email: 'b@x.x' };
    render(
      <App>
        <TaskTitles />
        <Probe />
      </App>,
    );
    await waitFor(() =>
      expect(screen.getByText('B의 별개 할 일')).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByText('try-steal'));
    // The adapter is called (the request is made), but RLS at the DB layer
    // would return 0 rows affected. The reducer's `update` action ignores
    // unknown ids → B's view is unchanged.
    expect(adapter.updateTask).toHaveBeenCalledWith(
      expect.anything(),
      't-a1',
      { title: '훔치려는 시도' },
    );
    expect(screen.queryByText('훔치려는 시도')).not.toBeInTheDocument();
    expect(screen.getByText('B의 별개 할 일')).toBeInTheDocument();
  });

  it('logging out clears the view and the cached snapshot', async () => {
    auth.user = { id: 'user-a', email: 'a@x.x' };
    const { rerender } = render(
      <App>
        <TaskTitles />
      </App>,
    );
    await waitFor(() =>
      expect(screen.getByText('A의 비공개 할 일')).toBeInTheDocument(),
    );
    expect(localStorage.getItem('demodev-tasks:cloud-snapshot')).toContain(
      'A의 비공개 할 일',
    );

    auth.user = null;
    rerender(
      <App>
        <TaskTitles />
      </App>,
    );
    await waitFor(() =>
      expect(screen.queryByText('A의 비공개 할 일')).not.toBeInTheDocument(),
    );
    expect(localStorage.getItem('demodev-tasks:cloud-snapshot')).toBeNull();
  });
});
