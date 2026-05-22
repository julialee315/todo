import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

const handlers = vi.hoisted(() => {
  let listener: ((event: string, session: unknown) => void) | null = null;
  return {
    getSession: vi.fn<() => Promise<any>>(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: vi.fn((cb: (e: string, s: unknown) => void) => {
      listener = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    signInWithPassword: vi.fn<(arg: any) => Promise<any>>(async () => ({ data: { user: null }, error: null })),
    signUp: vi.fn<(arg: any) => Promise<any>>(async () => ({ data: { user: null }, error: null })),
    signOut: vi.fn<() => Promise<any>>(async () => ({ error: null })),
    signInWithOAuth: vi.fn<(arg: any) => Promise<any>>(async () => ({ data: { url: '' }, error: null })),
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
      this.signOut.mockReset().mockResolvedValue({ error: null });
      this.signInWithOAuth.mockReset().mockResolvedValue({ data: { url: '' }, error: null });
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
      signOut: handlers.signOut,
      signInWithOAuth: handlers.signInWithOAuth,
    },
  }),
}));

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: push }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

import { AuthProvider, useAuth } from '@/context/AuthProvider';
import { LoginScreen } from '@/components/login/LoginScreen';
import { LogoutButton } from '@/components/shared/LogoutButton';

function App({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function CurrentEmail() {
  const { user, loading } = useAuth();
  if (loading) return <span>loading</span>;
  return <span>email:{user?.email ?? 'none'}</span>;
}

beforeEach(() => {
  handlers.reset();
  push.mockClear();
});

describe('Auth flow integration', () => {
  it('signs up → lands on /main → signs out → returns to /', async () => {
    handlers.signUp.mockResolvedValueOnce({
      data: {
        user: { id: 'u-new', email: 'new@example.com', app_metadata: { provider: 'email' } },
      },
      error: null,
    });

    render(
      <App>
        <LoginScreen />
        <CurrentEmail />
        <LogoutButton />
      </App>,
    );

    await userEvent.click(screen.getByRole('tab', { name: '회원가입' }));
    await userEvent.type(screen.getByLabelText('이메일'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'longenoughpw');
    await userEvent.click(screen.getByRole('button', { name: '회원가입' }));

    await waitFor(() => expect(handlers.signUp).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith('/main');

    // Supabase fires SIGNED_IN with the new session
    handlers.fire('SIGNED_IN', {
      user: { id: 'u-new', email: 'new@example.com', app_metadata: { provider: 'email' } },
    });
    await waitFor(() =>
      expect(screen.getByText('email:new@example.com')).toBeInTheDocument(),
    );

    // Sign out → email reverts to none
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    handlers.fire('SIGNED_OUT', null);
    await waitFor(() => expect(screen.getByText('email:none')).toBeInTheDocument());
  });

  it('shows an error alert when the password is wrong', async () => {
    handlers.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });

    render(
      <App>
        <LoginScreen />
      </App>,
    );

    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'wrongpwd');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent(/이메일 또는 비밀번호/);
    expect(push).not.toHaveBeenCalled();
  });
});
