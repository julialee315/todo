'use client';

// Theme state — cloud-backed once the user signs in, falls back to a
// localStorage cache otherwise so the login screen still respects the user's
// last preference. The anti-FOUC inline script in app/layout.tsx handles
// pre-paint theme application from the cache key.
//
// Save rule: we upsert to Supabase only when (a) the user is authed,
// (b) hydration from the server (or the explicit decision to skip it for an
// unauthed mount) has completed, and (c) the new theme differs from the
// previously rendered theme. Without those gates the hydration write would
// echo back to the server.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Theme } from '@/lib/types';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/context/AuthProvider';
import { loadPreferences } from '@/lib/supabase-store/tasks-repo';
import { savePreference } from '@/lib/supabase-store/preferences';

const THEME_CACHE_KEY = 'demodev-tasks:theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readCachedTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(THEME_CACHE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function writeCachedTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme);
  } catch {
    // Best-effort; storage quota errors are not fatal.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [theme, setTheme] = useState<Theme>('light');
  const [hydrated, setHydrated] = useState(false);
  const prevTheme = useRef<Theme>('light');

  // Hydrate from the local cache on first mount (covers logged-out users).
  useEffect(() => {
    setTheme(readCachedTheme());
  }, []);

  // Hydrate from the server when an authenticated user appears, then mark
  // hydrated. If the user is null, we still mark hydrated so toggles work
  // (unauthed toggles persist only to cache).
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setHydrated(true);
      return;
    }
    setHydrated(false);
    (async () => {
      try {
        const pref = await loadPreferences(supabase, user.id);
        if (!cancelled) setTheme(pref.theme);
      } catch {
        // Stay on the cached value if the fetch fails.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Mirror to <html data-theme> on every change, write the cache, and (if
  // hydrated + authed + actually different from the previous theme) sync to
  // the user_preferences row.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeCachedTheme(theme);
    const changed = prevTheme.current !== theme;
    prevTheme.current = theme;
    if (hydrated && user && changed) {
      void savePreference(supabase, user.id, { theme }).catch(() => {
        // Best-effort; the user keeps working with their local theme.
      });
    }
  }, [theme, user, hydrated, supabase]);

  const toggleTheme = () =>
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
