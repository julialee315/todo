'use client';

// Cloud-backed task state (Feature 002).
//
// The reducer remains a pure module. This Provider is the round-trip layer:
//   1. When the user authenticates, fetch tasks + ensure the seed, then
//      dispatch `hydrate` so the UI shows the cloud's latest snapshot.
//   2. Every mutation calls the matching adapter, awaits the server response,
//      then dispatches with the server-issued id. This avoids the
//      local-vs-server id mismatch that would otherwise break follow-up
//      edits.
//   3. After every successful hydrate, we persist a snapshot to localStorage
//      so reloads while offline still render a populated screen — reads
//      only; offline edits are blocked.
//   4. While offline, mutation calls throw so callers can surface a notice.
//
// Tests mock '@/utils/supabase/client' and '@/context/AuthProvider' so this
// module never reaches the network.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';
import type { CategoryId, Task, ViewId } from '@/lib/types';
import { tasksReducer } from '@/lib/store/reducer';
import { todayKey } from '@/lib/store/dates';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthProvider';
import { ensureSeed } from '@/lib/supabase-store/seed';
import { listTasksForUser } from '@/lib/supabase-store/tasks-repo';
import {
  addTask as addTaskAdapter,
  updateTask as updateTaskAdapter,
  deleteTask as deleteTaskAdapter,
  toggleTaskDone as toggleTaskDoneAdapter,
  toggleTaskStarred as toggleTaskStarredAdapter,
} from '@/lib/supabase-store/tasks-mutations';
import {
  addSubtask as addSubtaskAdapter,
  updateSubtask as updateSubtaskAdapter,
  deleteSubtask as deleteSubtaskAdapter,
} from '@/lib/supabase-store/subtasks';
import {
  loadSnapshot,
  saveSnapshot,
  clearSnapshot,
} from '@/lib/supabase-store/cache';

export interface TasksContextValue {
  tasks: Task[];
  /** True after the first successful (or cache-fallback) hydrate. */
  ready: boolean;
  /** True while online. Mutations throw when false. */
  online: boolean;
  addTask: (
    title: string,
    categoryHint: CategoryId | null,
    view: ViewId,
  ) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  toggleDone: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  addSub: (taskId: string, text: string) => Promise<void>;
  toggleSub: (taskId: string, subId: string) => Promise<void>;
  deleteSub: (taskId: string, subId: string) => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

const OFFLINE_MSG = '오프라인 상태에서는 변경할 수 없어요.';

export function TasksProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [tasks, dispatch] = useReducer(tasksReducer, []);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);

  // Online listener — set once on mount, update on browser network events.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOnline(window.navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // Hydrate whenever the auth identity changes.
  useEffect(() => {
    if (!user) {
      dispatch({ type: 'hydrate', tasks: [] });
      setReady(false);
      clearSnapshot();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await ensureSeed(supabase, user.id);
        const fetched = await listTasksForUser(supabase, user.id);
        if (cancelled) return;
        dispatch({ type: 'hydrate', tasks: fetched });
        saveSnapshot(fetched);
        setReady(true);
      } catch {
        // Network or RLS error → fall back to the last cached snapshot so
        // the user still sees something while offline / during incidents.
        const cached = loadSnapshot();
        if (cached && !cancelled) {
          dispatch({ type: 'hydrate', tasks: cached });
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Mirror task list to the snapshot after every change so a reload while
  // offline still renders the most recent state.
  useEffect(() => {
    if (ready) saveSnapshot(tasks);
  }, [tasks, ready]);

  const requireOnlineUser = useCallback(() => {
    if (!user) throw new Error('로그인이 필요해요.');
    if (!online) throw new Error(OFFLINE_MSG);
  }, [online, user]);

  const value: TasksContextValue = {
    tasks,
    ready,
    online,
    addTask: async (title, categoryHint, view) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      requireOnlineUser();
      const due = view === 'upcoming' ? '2026-05-18' : todayKey();
      const task = await addTaskAdapter(supabase, user!.id, {
        title: trimmed,
        due,
        category: categoryHint ?? 'dev',
      });
      dispatch({ type: 'add', task });
    },
    updateTask: async (id, patch) => {
      requireOnlineUser();
      await updateTaskAdapter(supabase, id, patch);
      dispatch({ type: 'update', id, patch });
    },
    deleteTask: async (id) => {
      requireOnlineUser();
      await deleteTaskAdapter(supabase, id);
      dispatch({ type: 'delete', id });
    },
    toggleDone: async (id) => {
      requireOnlineUser();
      const current = tasks.find((t) => t.id === id);
      if (!current) return;
      await toggleTaskDoneAdapter(supabase, id, !current.done);
      dispatch({ type: 'toggleDone', id });
    },
    toggleStar: async (id) => {
      requireOnlineUser();
      const current = tasks.find((t) => t.id === id);
      if (!current) return;
      await toggleTaskStarredAdapter(supabase, id, !current.starred);
      dispatch({ type: 'toggleStar', id });
    },
    addSub: async (taskId, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      requireOnlineUser();
      const sub = await addSubtaskAdapter(supabase, taskId, trimmed);
      dispatch({ type: 'addSub', taskId, sub });
    },
    toggleSub: async (taskId, subId) => {
      requireOnlineUser();
      const task = tasks.find((t) => t.id === taskId);
      const sub = task?.subs.find((s) => s.id === subId);
      if (!sub) return;
      await updateSubtaskAdapter(supabase, subId, { done: !sub.done });
      dispatch({ type: 'toggleSub', taskId, subId });
    },
    deleteSub: async (taskId, subId) => {
      requireOnlineUser();
      await deleteSubtaskAdapter(supabase, subId);
      dispatch({ type: 'deleteSub', taskId, subId });
    },
  };

  return (
    <TasksContext.Provider value={value}>{children}</TasksContext.Provider>
  );
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within a TasksProvider');
  return ctx;
}
