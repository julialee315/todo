import { describe, it, expect } from 'vitest';
import { tasksReducer } from '@/lib/store/reducer';
import { todayKey } from '@/lib/store/dates';
import type { Task } from '@/lib/types';

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

describe('reducer: add', () => {
  it('inserts a new task at the front with defaults', () => {
    const next = tasksReducer(fixture(), {
      type: 'add',
      id: 'new1',
      title: '  새 할 일  ',
      categoryHint: null,
      view: 'today',
    });
    expect(next).toHaveLength(3);
    expect(next[0]).toEqual({
      id: 'new1',
      title: '새 할 일',
      due: todayKey(),
      priority: 'none',
      category: 'dev',
      starred: false,
      done: false,
      notes: '',
      subs: [],
    });
  });

  it('uses the category hint when provided', () => {
    const next = tasksReducer(fixture(), {
      type: 'add',
      id: 'n',
      title: 'x',
      categoryHint: 'design',
      view: 'inbox',
    });
    expect(next[0].category).toBe('design');
  });

  it('gives upcoming-view additions a future due date', () => {
    const next = tasksReducer(fixture(), {
      type: 'add',
      id: 'n',
      title: 'x',
      categoryHint: null,
      view: 'upcoming',
    });
    expect(next[0].due > todayKey()).toBe(true);
  });

  it('ignores blank titles (no state change)', () => {
    const state = fixture();
    expect(tasksReducer(state, {
      type: 'add', id: 'n', title: '   ', categoryHint: null, view: 'today',
    })).toBe(state);
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
  it('addSub appends a subtask', () => {
    const next = tasksReducer(fixture(), {
      type: 'addSub',
      taskId: 't1',
      subId: 's9',
      text: '  새 서브  ',
    });
    expect(next[0].subs).toHaveLength(2);
    expect(next[0].subs[1]).toEqual({ id: 's9', text: '새 서브', done: false });
  });

  it('addSub ignores blank text', () => {
    const state = fixture();
    expect(
      tasksReducer(state, { type: 'addSub', taskId: 't1', subId: 's9', text: '  ' }),
    ).toBe(state);
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
  it('replaces the whole list (used to load persisted state after mount)', () => {
    const loaded: Task[] = [
      {
        id: 'L1',
        title: 'loaded',
        due: '',
        priority: 'none',
        category: 'dev',
        starred: false,
        done: false,
        notes: '',
        subs: [],
      },
    ];
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
    tasksReducer(state, { type: 'addSub', taskId: 't1', subId: 's2', text: 'y' });
    expect(state).toEqual(snapshot);
  });
});
