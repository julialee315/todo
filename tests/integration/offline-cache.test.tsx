import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Task } from '@/lib/types';

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ from: vi.fn(), auth: {} }),
}));

const adapter = vi.hoisted(() => ({
  ensureSeed: vi.fn(async () => undefined),
  listTasksForUser: vi.fn<(...a: any[]) => Promise<Task[]>>(async () => []),
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
vi.mock('@/lib/supabase-store/realtime', () => ({
  subscribeToUserChanges: vi.fn(() => () => {}),
}));

const auth = vi.hoisted(() => ({
  user: { id: 'u-1', email: 'a@b.c' } as null | { id: string; email: string },
}));
vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ user: auth.user, loading: false, signOut: vi.fn() }),
}));

import { TasksProvider, useTasks } from '@/context/TasksProvider';

function Probe() {
  const { tasks, online, toggleDone } = useTasks();
  return (
    <div>
      <span data-testid="online">{String(online)}</span>
      <span data-testid="first">{tasks[0]?.title ?? '없음'}</span>
      <button
        onClick={() =>
          tasks[0] && void toggleDone(tasks[0].id).catch(() => {})
        }
      >
        flip
      </button>
    </div>
  );
}

function fakeTask(id: string, title: string): Task {
  return {
    id,
    title,
    due: '',
    priority: 'none',
    category: 'dev',
    starred: false,
    done: false,
    notes: '',
    subs: [],
  };
}

beforeEach(() => {
  auth.user = { id: 'u-1', email: 'a@b.c' };
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    get: () => true,
  });
  for (const fn of Object.values(adapter)) (fn as any).mockReset();
  adapter.ensureSeed.mockResolvedValue(undefined);
  adapter.listTasksForUser.mockResolvedValue([]);
  localStorage.clear();
});

describe('Offline cache', () => {
  it('hydrates from the last snapshot when the live fetch fails', async () => {
    adapter.listTasksForUser.mockRejectedValueOnce(new Error('network'));
    localStorage.setItem(
      'demodev-tasks:cloud-snapshot',
      JSON.stringify([fakeTask('cached', '캐시된 할 일')]),
    );

    render(
      <TasksProvider>
        <Probe />
      </TasksProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('first')).toHaveTextContent('캐시된 할 일'),
    );
  });

  it('blocks mutations and never calls the adapter once the browser flips offline', async () => {
    adapter.listTasksForUser.mockResolvedValueOnce([fakeTask('t1', 'live')]);
    render(
      <TasksProvider>
        <Probe />
      </TasksProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('first')).toHaveTextContent('live'),
    );

    await act(async () => {
      Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        get: () => false,
      });
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('online')).toHaveTextContent('false'),
    );

    adapter.toggleTaskDone.mockClear();
    await userEvent.click(screen.getByText('flip'));
    expect(adapter.toggleTaskDone).not.toHaveBeenCalled();
  });

  it('mirrors the latest tasks to the snapshot key after every change', async () => {
    adapter.listTasksForUser.mockResolvedValueOnce([fakeTask('t1', '미러 대상')]);
    render(
      <TasksProvider>
        <Probe />
      </TasksProvider>,
    );
    await waitFor(() =>
      expect(localStorage.getItem('demodev-tasks:cloud-snapshot')).toContain(
        '미러 대상',
      ),
    );
  });
});
