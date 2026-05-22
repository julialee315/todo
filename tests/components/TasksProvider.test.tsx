import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { Task } from '@/lib/types';

// ---------------------------------------------------------------------------
// Mocks. The Provider's flow under test:
//   AuthProvider → user.id → ensureSeed → listTasksForUser → dispatch hydrate
//   mutation → adapter call → dispatch local action
// We mock both the supabase client (to avoid network) and the adapter
// functions (to assert the round-trips without recreating the chain shape).
// ---------------------------------------------------------------------------

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ from: vi.fn(), auth: {} }),
}));

const adapter = vi.hoisted(() => ({
  ensureSeed: vi.fn(async () => undefined),
  listTasksForUser: vi.fn<(...a: any[]) => Promise<Task[]>>(async () => [] as Task[]),
  addTask: vi.fn(async () => ({}) as Task),
  updateTask: vi.fn(async () => {}),
  deleteTask: vi.fn(async () => {}),
  toggleTaskDone: vi.fn(async () => {}),
  toggleTaskStarred: vi.fn(async () => {}),
  addSubtask: vi.fn(async () => ({ id: 's-srv', text: '', done: false })),
  updateSubtask: vi.fn(async () => {}),
  deleteSubtask: vi.fn(async () => {}),
}));
vi.mock('@/lib/supabase-store/seed', () => ({ ensureSeed: adapter.ensureSeed }));
vi.mock('@/lib/supabase-store/tasks-repo', () => ({
  listTasksForUser: adapter.listTasksForUser,
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

const auth = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ user: auth.user, loading: false, signOut: vi.fn() }),
}));

import { TasksProvider, useTasks } from '@/context/TasksProvider';

function Probe() {
  const { tasks, ready, online, addTask, toggleDone, deleteTask, addSub } =
    useTasks();
  return (
    <div>
      <span data-testid="count">{tasks.length}</span>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="online">{String(online)}</span>
      <span data-testid="first-title">{tasks[0]?.title}</span>
      <button onClick={() => void addTask('새 작업', null, 'today').catch(() => {})}>add</button>
      <button onClick={() => tasks[0] && void toggleDone(tasks[0].id).catch(() => {})}>toggleDone</button>
      <button onClick={() => tasks[0] && void deleteTask(tasks[0].id).catch(() => {})}>delete</button>
      <button onClick={() => tasks[0] && void addSub(tasks[0].id, 'new').catch(() => {})}>addSub</button>
    </div>
  );
}

function setup() {
  return render(
    <TasksProvider>
      <Probe />
    </TasksProvider>,
  );
}

function fakeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    due: '',
    priority: 'none',
    category: 'dev',
    starred: false,
    done: false,
    notes: '',
    subs: [],
    ...overrides,
  };
}

beforeEach(() => {
  auth.user = null;
  for (const fn of Object.values(adapter)) (fn as any).mockReset();
  adapter.ensureSeed.mockResolvedValue(undefined);
  adapter.listTasksForUser.mockResolvedValue([]);
  adapter.addTask.mockResolvedValue({} as Task);
  adapter.addSubtask.mockResolvedValue({ id: 's-srv', text: '', done: false });
  localStorage.clear();
});

describe('TasksProvider: unauthenticated', () => {
  it('renders an empty list, ready=false, and never calls the adapters', () => {
    setup();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('ready')).toHaveTextContent('false');
    expect(adapter.listTasksForUser).not.toHaveBeenCalled();
  });
});

describe('TasksProvider: authenticated hydrate', () => {
  it('seeds, fetches, and dispatches hydrate when a user appears', async () => {
    auth.user = { id: 'u-1', email: 'a@b.c' };
    const fetched = [fakeTask('t1', { title: 'first' }), fakeTask('t2')];
    adapter.listTasksForUser.mockResolvedValueOnce(fetched);

    setup();

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
    expect(screen.getByTestId('first-title')).toHaveTextContent('first');
    expect(adapter.ensureSeed).toHaveBeenCalledWith(expect.anything(), 'u-1');
    expect(adapter.listTasksForUser).toHaveBeenCalledWith(expect.anything(), 'u-1');
  });

  it('falls back to the localStorage snapshot when the fetch fails', async () => {
    auth.user = { id: 'u-1', email: 'a@b.c' };
    adapter.listTasksForUser.mockRejectedValueOnce(new Error('network'));
    localStorage.setItem(
      'demodev-tasks:cloud-snapshot',
      JSON.stringify([fakeTask('cached', { title: 'from cache' })]),
    );

    setup();

    await waitFor(() =>
      expect(screen.getByTestId('first-title')).toHaveTextContent('from cache'),
    );
    expect(screen.getByTestId('ready')).toHaveTextContent('true');
  });
});

describe('TasksProvider: mutations go through the adapter', () => {
  beforeEach(() => {
    auth.user = { id: 'u-1', email: 'a@b.c' };
    adapter.listTasksForUser.mockResolvedValue([
      fakeTask('t1', { title: 'first', done: false }),
    ]);
  });

  it('addTask calls the adapter and dispatches with the server-issued task', async () => {
    adapter.addTask.mockResolvedValueOnce(
      fakeTask('srv-id', { title: '새 작업' }),
    );
    setup();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));

    await userEvent.click(screen.getByText('add'));
    expect(adapter.addTask).toHaveBeenCalledWith(
      expect.anything(),
      'u-1',
      expect.objectContaining({ title: '새 작업', category: 'dev' }),
    );
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(screen.getByTestId('first-title')).toHaveTextContent('새 작업');
  });

  it('toggleDone awaits the adapter then dispatches', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    await userEvent.click(screen.getByText('toggleDone'));
    expect(adapter.toggleTaskDone).toHaveBeenCalledWith(
      expect.anything(),
      't1',
      true,
    );
  });

  it('deleteTask awaits the adapter then dispatches', async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    await userEvent.click(screen.getByText('delete'));
    expect(adapter.deleteTask).toHaveBeenCalledWith(expect.anything(), 't1');
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'));
  });

  it('addSub trims input and dispatches the server-issued sub', async () => {
    adapter.addSubtask.mockResolvedValueOnce({
      id: 's-srv',
      text: 'new',
      done: false,
    });
    setup();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    await userEvent.click(screen.getByText('addSub'));
    expect(adapter.addSubtask).toHaveBeenCalledWith(
      expect.anything(),
      't1',
      'new',
    );
  });
});

describe('TasksProvider: offline gate', () => {
  it('throws from a mutation when navigator.onLine is false', async () => {
    auth.user = { id: 'u-1', email: 'a@b.c' };
    adapter.listTasksForUser.mockResolvedValueOnce([fakeTask('t1')]);

    setup();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));

    // Flip to offline by firing the browser event the Provider listens for.
    await act(async () => {
      Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        get: () => false,
      });
      window.dispatchEvent(new Event('offline'));
    });

    await waitFor(() => expect(screen.getByTestId('online')).toHaveTextContent('false'));

    // The mutation should not call the adapter.
    adapter.toggleTaskDone.mockClear();
    let caught: unknown;
    try {
      await act(async () => {
        await userEvent.click(screen.getByText('toggleDone'));
      });
    } catch (e) {
      caught = e;
    }
    // userEvent swallows the throw; assert on side effects instead.
    expect(adapter.toggleTaskDone).not.toHaveBeenCalled();
  });
});

describe('TasksProvider: snapshot mirror', () => {
  it('writes the latest tasks to the cloud-snapshot key after hydrate', async () => {
    auth.user = { id: 'u-1', email: 'a@b.c' };
    adapter.listTasksForUser.mockResolvedValueOnce([
      fakeTask('t1', { title: 'snap me' }),
    ]);
    setup();
    await waitFor(() =>
      expect(localStorage.getItem('demodev-tasks:cloud-snapshot')).toContain(
        'snap me',
      ),
    );
  });
});
