import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ from: vi.fn(), auth: {} }),
}));

const adapter = vi.hoisted(() => ({
  loadPreferences: vi.fn(async () => ({ view: 'inbox', sort: 'created_desc', theme: 'light' })),
  savePreference: vi.fn(async () => undefined),
}));
vi.mock('@/lib/supabase-store/tasks-repo', () => ({
  loadPreferences: adapter.loadPreferences,
}));
vi.mock('@/lib/supabase-store/preferences', () => ({
  savePreference: adapter.savePreference,
}));
vi.mock('@/lib/supabase-store/realtime', () => ({
  subscribeToUserChanges: vi.fn(() => () => {}),
}));

const auth = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ user: auth.user, loading: false, signOut: vi.fn() }),
}));

import { ThemeProvider, useTheme } from '@/context/ThemeProvider';

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

function setup() {
  return render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  auth.user = null;
  document.documentElement.dataset.theme = '';
  adapter.loadPreferences.mockReset().mockResolvedValue({
    view: 'inbox',
    sort: 'created_desc',
    theme: 'light',
  });
  adapter.savePreference.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
});

describe('ThemeProvider: unauthenticated', () => {
  it('defaults to light and applies data-theme', () => {
    setup();
    expect(screen.getByTestId('theme')).toHaveTextContent('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('toggleTheme flips the theme and persists to the local cache', async () => {
    setup();
    await userEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('demodev-tasks:theme')).toBe('dark');
    expect(adapter.savePreference).not.toHaveBeenCalled();
  });

  it('hydrates from the local cache on mount', () => {
    localStorage.setItem('demodev-tasks:theme', 'dark');
    setup();
    expect(screen.getByTestId('theme')).toHaveTextContent('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('ThemeProvider: authenticated', () => {
  it('loads the stored preference and applies it', async () => {
    auth.user = { id: 'u-1', email: 'a@b.c' };
    adapter.loadPreferences.mockResolvedValueOnce({
      view: 'today',
      sort: 'priority',
      theme: 'dark',
    });
    setup();
    await waitFor(() =>
      expect(screen.getByTestId('theme')).toHaveTextContent('dark'),
    );
    expect(adapter.loadPreferences).toHaveBeenCalledWith(
      expect.anything(),
      'u-1',
    );
  });

  it('persists toggles to the user_preferences row', async () => {
    auth.user = { id: 'u-1', email: 'a@b.c' };
    setup();
    // wait for the hydrate effect to settle so the next setTheme is treated
    // as a user action, not the hydration write.
    await waitFor(() => expect(adapter.loadPreferences).toHaveBeenCalled());
    await userEvent.click(screen.getByText('toggle'));
    await waitFor(() =>
      expect(adapter.savePreference).toHaveBeenCalledWith(
        expect.anything(),
        'u-1',
        expect.objectContaining({ theme: 'dark' }),
      ),
    );
  });
});
