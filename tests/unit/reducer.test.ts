import { describe, it, expect } from 'vitest';
import { tasksReducer } from '@/lib/store/reducer';
import type { Subtask, Task } from '@/lib/types';

function fixture(): Task[] {
  return [
    {
      id: 't1',
      title: 'one',
      due: '2026-05-15',
      priority: 'med',
      category: 'dev',
      starred: false,
      done: false,
      notes: 'n',
      subs: [{ id: 's1', text: 'sub', done: false }],
    },
    {
      id: 't2',
      title: 'two',
      due: '2026-05-16',
      priority: 'none',
      category: 'design',
      starred: true,
      done: true,
      notes: '',
      subs: [],
    },
  ];
}

function newTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: 'fresh',
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

describe('reducer: add (Feature 002 — receives a server-shaped Task)', () => {
  it('inserts the carried task at the front', () => {
    const t = newTask('new1', { title: '서버 응답 제목' });
    const next = tasksReducer(fixture(), { type: 'add', task: t });
    expect(next).toHaveLength(3);
    expect(next[0]).toBe(t);
  });

  it('is idempotent — adding a task whose id already exists returns the same state ref', () => {
    const state = fixture();
    const dup = newTask('t1', { title: 'echo of an existing task' });
    expect(tasksReducer(state, { type: 'add', task: dup })).toBe(state);
  });
});

describe('reducer: update / delete', () => {
  it('merges a patch into the matching task', () => {
    const next = tasksReducer(fixture(), {
      type: 'update',
      id: 't1',
      patch: { title: 'edited', priority: 'high' },
    });
    expect(next[0].title).toBe('edited');
    expect(next[0].priority).toBe('high');
    expect(next[0].notes).toBe('n'); // untouched
  });

  it('update with unknown id leaves state unchanged', () => {
    const state = fixture();
    expect(tasksReducer(state, { type: 'update', id: 'nope', patch: {} })).toBe(
      state,
    );
  });

  it('delete removes the matching task', () => {
    const next = tasksReducer(fixture(), { type: 'delete', id: 't1' });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('t2');
  });
});

describe('reducer: toggles', () => {
  it('toggleDone flips done', () => {
    const next = tasksReducer(fixture(), { type: 'toggleDone', id: 't1' });
    expect(next[0].done).toBe(true);
  });

  it('toggleStar flips starred', () => {
    const next = tasksReducer(fixture(), { type: 'toggleStar', id: 't2' });
    expect(next[1].starred).toBe(false);
  });
});

describe('reducer: subtasks', () => {
  it('addSub appends the carried sub', () => {
    const sub: Subtask = { id: 's9', text: '새 서브', done: false };
    const next = tasksReducer(fixture(), {
      type: 'addSub',
      taskId: 't1',
      sub,
    });
    expect(next[0].subs).toHaveLength(2);
    expect(next[0].subs[1]).toBe(sub);
  });

  it('addSub is idempotent — duplicate sub id is dropped', () => {
    const state = fixture();
    expect(
      tasksReducer(state, {
        type: 'addSub',
        taskId: 't1',
        sub: { id: 's1', text: 'echo', done: false },
      }),
    ).toBe(state);
  });

  it('updateSub merges a patch into the matching sub', () => {
    const next = tasksReducer(fixture(), {
      type: 'updateSub',
      taskId: 't1',
      subId: 's1',
      patch: { text: 'edited' },
    });
    expect(next[0].subs[0]).toEqual({ id: 's1', text: 'edited', done: false });
  });

  it('toggleSub flips a subtask done', () => {
    const next = tasksReducer(fixture(), {
      type: 'toggleSub',
      taskId: 't1',
      subId: 's1',
    });
    expect(next[0].subs[0].done).toBe(true);
  });

  it('deleteSub removes a subtask', () => {
    const next = tasksReducer(fixture(), {
      type: 'deleteSub',
      taskId: 't1',
      subId: 's1',
    });
    expect(next[0].subs).toHaveLength(0);
  });
});

describe('reducer: hydrate', () => {
  it('replaces the whole list (used to load fetched state after mount)', () => {
    const loaded: Task[] = [newTask('L1', { title: 'loaded' })];
    expect(tasksReducer(fixture(), { type: 'hydrate', tasks: loaded })).toBe(
      loaded,
    );
  });
});

describe('reducer: purity', () => {
  it('does not mutate the input state or its tasks', () => {
    const state = fixture();
    const snapshot = JSON.parse(JSON.stringify(state));
    tasksReducer(state, { type: 'toggleDone', id: 't1' });
    tasksReducer(state, { type: 'update', id: 't1', patch: { title: 'z' } });
    tasksReducer(state, {
      type: 'addSub',
      taskId: 't1',
      sub: { id: 's2', text: 'y', done: false },
    });
    expect(state).toEqual(snapshot);
  });
});
