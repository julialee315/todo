import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Mock the supabase browser client at the module boundary so the test never
// reaches the real network. Hoisted handlers let each test rewire behaviour.
// ---------------------------------------------------------------------------
const handlers = vi.hoisted(() => {
  let listener: ((event: string, session: unknown) => void) | null = null;
  // `any` Promise return so tests can mockResolvedValueOnce with either
  // null-shaped success or error-shaped failure without TS narrowing.
  return {
    getSession: vi.fn<() => Promise<any>>(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
      listener = cb;
      return {
        data: { subscription: { unsubscribe: vi.fn() } },
      };
    }),
    signInWithPassword: vi.fn<(arg: any) => Promise<any>>(async () => ({ data: { user: null }, error: null })),
    signUp: vi.fn<(arg: any) => Promise<any>>(async () => ({ data: { user: null }, error: null })),
    signInWithOAuth: vi.fn<(arg: any) => Promise<any>>(async () => ({ data: { url: '' }, error: null })),
    signOut: vi.fn<() => Promise<any>>(async () => ({ error: null })),
    fire: (event: string, session: unknown) => listener?.(event, session),
    reset() {
      listener = null;
      this.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
      this.onAuthStateChange.mockReset().mockImplementation((cb: (e: string, s: unknown) => void) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });
      this.signInWithPassword.mockReset().mockResolvedValue({ data: { user: null }, error: null });
      this.signUp.mockReset().mockResolvedValue({ data: { user: null }, error: null });
      this.signInWithOAuth.mockReset().mockResolvedValue({ data: { url: '' }, error: null });
      this.signOut.mockReset().mockResolvedValue({ error: null });
    },
  };
});

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: handlers.getSession,
      onAuthStateChange: handlers.onAuthStateChange,
      signInWithPassword: handlers.signInWithPassword,
      signUp: handlers.signUp,
      signInWithOAuth: handlers.signInWithOAuth,
      signOut: handlers.signOut,
    },
  }),
}));

import { AuthProvider, useAuth } from '@/context/AuthProvider';

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => handlers.reset());

describe('AuthProvider: initial state & bootstrap', () => {
  it('starts in loading=true, then resolves to user=null when no session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('exposes the user from an existing session on mount', async () => {
    handlers.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: 'u-1', email: 'a@example.com', app_metadata: { provider: 'email' } },
        },
      },
      error: null,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual({ id: 'u-1', email: 'a@example.com', provider: 'email' });
  });
});

describe('AuthProvider: signInWithPassword', () => {
  it('returns error=null on success and the user populates via onAuthStateChange', async () => {
    handlers.signInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: 'u-2', email: 'b@example.com', app_metadata: { provider: 'email' } },
      },
      error: null,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: { error: string | null } | undefined;
    await act(async () => {
      res = await result.current.signInWithPassword('b@example.com', 'pwpwpwpw');
    });
    expect(res!.error).toBeNull();
    expect(handlers.signInWithPassword).toHaveBeenCalledWith({
      email: 'b@example.com',
      password: 'pwpwpwpw',
    });

    await act(async () => {
      handlers.fire('SIGNED_IN', {
        user: { id: 'u-2', email: 'b@example.com', app_metadata: { provider: 'email' } },
      });
    });
    expect(result.current.user?.id).toBe('u-2');
  });

  it('returns a friendly Korean error on invalid credentials', async () => {
    handlers.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let res: { error: string | null } | undefined;
    await act(async () => {
      res = await result.current.signInWithPassword('x@x.x', 'wrongpwd');
    });
    expect(res!.error).toMatch(/이메일 또는 비밀번호/);
  });
});

describe('AuthProvider: signUpWithPassword', () => {
  it('rejects passwords shorter than 8 characters before hitting Supabase', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res: { error: string | null } | undefined;
    await act(async () => {
      res = await result.current.signUpWithPassword('a@b.c', 'short');
    });
    expect(res!.error).toMatch(/8자 이상/);
    expect(handlers.signUp).not.toHaveBeenCalled();
  });

  it('translates the duplicate-email error into a friendly message', async () => {
    handlers.signUp.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'User already registered' },
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res: { error: string | null } | undefined;
    await act(async () => {
      res = await result.current.signUpWithPassword('dupe@x.x', 'longenoughpw');
    });
    expect(res!.error).toMatch(/이미 가입/);
  });

  it('returns error=null on success', async () => {
    handlers.signUp.mockResolvedValueOnce({
      data: {
        user: { id: 'u-3', email: 'new@x.x', app_metadata: { provider: 'email' } },
      },
      error: null,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let res: { error: string | null } | undefined;
    await act(async () => {
      res = await result.current.signUpWithPassword('new@x.x', 'longenoughpw');
    });
    expect(res!.error).toBeNull();
  });
});

describe('AuthProvider: signOut', () => {
  it('calls supabase.auth.signOut and clears the user on SIGNED_OUT event', async () => {
    handlers.getSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: 'u-9', email: 'z@z.z', app_metadata: { provider: 'email' } },
        },
      },
      error: null,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.id).toBe('u-9'));

    await act(async () => {
      await result.current.signOut();
    });
    expect(handlers.signOut).toHaveBeenCalledTimes(1);

    await act(async () => {
      handlers.fire('SIGNED_OUT', null);
    });
    expect(result.current.user).toBeNull();
  });
});

describe('AuthProvider: signInWithGoogle (US1 stub)', () => {
  it('delegates to supabase.auth.signInWithOAuth with provider=google', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.signInWithGoogle();
    });
    expect(handlers.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' }),
    );
  });
});

describe('useAuth outside provider', () => {
  it('throws a helpful error', () => {
    expect(() => renderHook(() => useAuth())).toThrowError(
      /AuthProvider/,
    );
  });
});

// Compile-only check that <AuthProvider> renders children without crashing.
describe('AuthProvider: renders children', () => {
  it('mounts and unmounts cleanly', () => {
    const { unmount } = render(<AuthProvider>{<span>ok</span>}</AuthProvider>);
    unmount();
  });
});
