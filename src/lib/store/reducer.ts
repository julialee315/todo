// Pure task reducer: same input → same output, never mutates its input.
//
// Feature 002 change: the `add` and `addSub` actions now carry an already-
// constructed Task / Subtask (with the server-generated id). Title trimming,
// default due dates, and id generation now live in TasksProvider, which talks
// to the Supabase adapter before dispatching. This lets the same action
// shape carry both local writes (round-trip through the adapter) and remote
// pushes (US3 realtime).

import type { Subtask, Task } from '@/lib/types';

export type TaskAction =
  | { type: 'add'; task: Task }
  | { type: 'update'; id: string; patch: Partial<Task> }
  | { type: 'delete'; id: string }
  | { type: 'toggleDone'; id: string }
  | { type: 'toggleStar'; id: string }
  | { type: 'addSub'; taskId: string; sub: Subtask }
  | { type: 'updateSub'; taskId: string; subId: string; patch: Partial<Subtask> }
  | { type: 'toggleSub'; taskId: string; subId: string }
  | { type: 'deleteSub'; taskId: string; subId: string }
  | { type: 'hydrate'; tasks: Task[] };

export function tasksReducer(state: Task[], action: TaskAction): Task[] {
  switch (action.type) {
    case 'hydrate':
      return action.tasks;

    case 'add':
      // If a task with the same id is already present (e.g. realtime echo of
      // our own insert), keep state stable.
      if (state.some((t) => t.id === action.task.id)) return state;
      return [action.task, ...state];

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
      const target = state.find((t) => t.id === action.taskId);
      if (!target) return state;
      // Echo dedupe: if this sub id already exists on the parent, no-op
      // (keeps the same state reference so downstream selectors don't churn).
      if (target.subs.some((s) => s.id === action.sub.id)) return state;
      return state.map((t) =>
        t.id === action.taskId
          ? { ...t, subs: [...t.subs, action.sub] }
          : t,
      );
    }

    case 'updateSub':
      return state.map((t) =>
        t.id === action.taskId
          ? {
              ...t,
              subs: t.subs.map((s) =>
                s.id === action.subId ? { ...s, ...action.patch } : s,
              ),
            }
          : t,
      );

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
