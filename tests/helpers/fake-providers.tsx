// In-memory fakes for the TasksProvider and ThemeProvider contexts. Used by
// screen tests so they don't have to mock supabase, useAuth, and the
// async hydration flow.
//
// The fakes mirror the real contracts — useState-backed mutations that
// trigger re-renders, plus reset between tests (each render() mounts a new
// component tree, so state starts fresh per test).

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import type { CategoryId, Subtask, Task, Theme, ViewId } from '@/lib/types';

interface TasksValue {
  tasks: Task[];
  ready: boolean;
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

const FakeTasksContext = createContext<TasksValue | null>(null);

let _seq = 0;
const nextId = (prefix: string) => `${prefix}${++_seq}`;

export function FakeTasksProvider({
  initialTasks,
  online = true,
  children,
}: {
  initialTasks: Task[];
  online?: boolean;
  children: ReactNode;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const value: TasksValue = {
    tasks,
    ready: true,
    online,
    addTask: async (title, categoryHint) => {
      const trimmed = title.trim();
      if (!trimmed) return;
      const task: Task = {
        id: nextId('t'),
        title: trimmed,
        due: '2026-05-15',
        priority: 'none',
        category: categoryHint ?? 'dev',
        starred: false,
        done: false,
        notes: '',
        subs: [],
      };
      setTasks((cur) => [task, ...cur]);
    },
    updateTask: async (id, patch) => {
      setTasks((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    },
    deleteTask: async (id) => {
      setTasks((cur) => cur.filter((t) => t.id !== id));
    },
    toggleDone: async (id) => {
      setTasks((cur) =>
        cur.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
      );
    },
    toggleStar: async (id) => {
      setTasks((cur) =>
        cur.map((t) => (t.id === id ? { ...t, starred: !t.starred } : t)),
      );
    },
    addSub: async (taskId, text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const sub: Subtask = { id: nextId('s'), text: trimmed, done: false };
      setTasks((cur) =>
        cur.map((t) =>
          t.id === taskId ? { ...t, subs: [...t.subs, sub] } : t,
        ),
      );
    },
    toggleSub: async (taskId, subId) => {
      setTasks((cur) =>
        cur.map((t) =>
          t.id === taskId
            ? {
                ...t,
                subs: t.subs.map((s) =>
                  s.id === subId ? { ...s, done: !s.done } : s,
                ),
              }
            : t,
        ),
      );
    },
    deleteSub: async (taskId, subId) => {
      setTasks((cur) =>
        cur.map((t) =>
          t.id === taskId
            ? { ...t, subs: t.subs.filter((s) => s.id !== subId) }
            : t,
        ),
      );
    },
  };

  return (
    <FakeTasksContext.Provider value={value}>
      {children}
    </FakeTasksContext.Provider>
  );
}

export function useFakeTasks(): TasksValue {
  const ctx = useContext(FakeTasksContext);
  if (!ctx) throw new Error('useFakeTasks: wrap in FakeTasksProvider');
  return ctx;
}

interface ThemeValue {
  theme: Theme;
  toggleTheme: () => void;
}

const FakeThemeContext = createContext<ThemeValue | null>(null);

export function FakeThemeProvider({
  initialTheme = 'light',
  children,
}: {
  initialTheme?: Theme;
  children: ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const value: ThemeValue = {
    theme,
    toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
  };
  return (
    <FakeThemeContext.Provider value={value}>
      {children}
    </FakeThemeContext.Provider>
  );
}

export function useFakeTheme(): ThemeValue {
  const ctx = useContext(FakeThemeContext);
  if (!ctx) throw new Error('useFakeTheme: wrap in FakeThemeProvider');
  return ctx;
}
