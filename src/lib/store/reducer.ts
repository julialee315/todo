// Pure task reducer: same input → same output, never mutates its input.
// IDs are generated outside the reducer (carried in the action payload) so it
// stays deterministic and unit-testable.

import type { CategoryId, Task, ViewId } from '@/lib/types';
import { todayKey } from '@/lib/store/dates';

export type TaskAction =
  | {
      type: 'add';
      id: string;
      title: string;
      categoryHint: CategoryId | null;
      view: ViewId;
    }
  | { type: 'update'; id: string; patch: Partial<Task> }
  | { type: 'delete'; id: string }
  | { type: 'toggleDone'; id: string }
  | { type: 'toggleStar'; id: string }
  | { type: 'addSub'; taskId: string; subId: string; text: string }
  | { type: 'toggleSub'; taskId: string; subId: string }
  | { type: 'deleteSub'; taskId: string; subId: string }
  | { type: 'hydrate'; tasks: Task[] };

export function tasksReducer(state: Task[], action: TaskAction): Task[] {
  switch (action.type) {
    case 'hydrate':
      return action.tasks;

    case 'add': {
      const title = action.title.trim();
      if (!title) return state;
      const next: Task = {
        id: action.id,
        title,
        due: action.view === 'upcoming' ? '2026-05-18' : todayKey(),
        priority: 'none',
        category: action.categoryHint ?? 'dev',
        starred: false,
        done: false,
        notes: '',
        subs: [],
      };
      return [next, ...state];
    }

    case 'update': {
      if (!state.some((t) => t.id === action.id)) return state;
      return state.map((t) =>
        t.id === action.id ? { ...t, ...action.patch } : t,
      );
    }

    case 'delete':
      return state.filter((t) => t.id !== action.id);

    case 'toggleDone':
      return state.map((t) =>
        t.id === action.id ? { ...t, done: !t.done } : t,
      );

    case 'toggleStar':
      return state.map((t) =>
        t.id === action.id ? { ...t, starred: !t.starred } : t,
      );

    case 'addSub': {
      const text = action.text.trim();
      if (!text) return state;
      return state.map((t) =>
        t.id === action.taskId
          ? { ...t, subs: [...t.subs, { id: action.subId, text, done: false }] }
          : t,
      );
    }

    case 'toggleSub':
      return state.map((t) =>
        t.id === action.taskId
          ? {
              ...t,
              subs: t.subs.map((s) =>
                s.id === action.subId ? { ...s, done: !s.done } : s,
              ),
            }
          : t,
      );

    case 'deleteSub':
      return state.map((t) =>
        t.id === action.taskId
          ? { ...t, subs: t.subs.filter((s) => s.id !== action.subId) }
          : t,
      );

    default:
      return state;
  }
}
