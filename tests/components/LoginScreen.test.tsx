import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';

// Mock the supabase client so LoginScreen → AuthProvider → createClient() does
// not touch the network. Each test starts with a clean slate via reset().
const handlers = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<any>>(async () => ({ data: { session: null }, error: null })),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
  signInWithPassword: vi.fn<(arg: any) => Promise<any>>(async () => ({ data: { user: null }, error: null })),
  signUp: vi.fn<(arg: any) => Promise<any>>(async () => ({ data: { user: null }, error: null })),
  signInWithOAuth: vi.fn<(arg: any) => Promise<any>>(async () => ({ data: { url: '' }, error: null })),
  signOut: vi.fn<() => Promise<any>>(async () => ({ error: null })),
}));

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

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: push }),
  useSearchParams: () => new URLSearchParams(),
}));

import { LoginScreen } from '@/components/login/LoginScreen';
import { AuthProvider } from '@/context/AuthProvider';

function Wrap({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

beforeEach(() => {
  push.mockClear();
  handlers.signInWithPassword.mockClear();
  handlers.signUp.mockClear();
  handlers.signInWithOAuth.mockClear();
  handlers.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
});

describe('LoginScreen — layout', () => {
  it('renders the dark hero copy and the form heading', () => {
    render(
      <Wrap>
        <LoginScreen />
      </Wrap>,
    );
    expect(screen.getByText('매일의 흐름')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /환영합니다/ }),
    ).toBeInTheDocument();
  });
});

describe('LoginScreen — tabs', () => {
  it('starts in 로그인 mode by default — submit button reads 로그인', () => {
    render(
      <Wrap>
        <LoginScreen />
      </Wrap>,
    );
    const submit = screen.getByRole('button', { name: '로그인' });
    expect(submit).toHaveAttribute('type', 'submit');
    // The signup label exists only as a tab in this initial state.
    expect(screen.getByRole('tab', { name: '회원가입' })).toBeInTheDocument();
  });

  it('switches to 회원가입 mode on tab click', async () => {
    render(
      <Wrap>
        <LoginScreen />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole('tab', { name: '회원가입' }));
    expect(
      screen.getByRole('button', { name: '회원가입' }),
    ).toBeInTheDocument();
  });
});

describe('LoginScreen — signin', () => {
  it('calls signInWithPassword and navigates to /main on success', async () => {
    handlers.signInWithPassword.mockResolvedValueOnce({
      data: {
        user: { id: 'u1', email: 'a@b.c', app_metadata: { provider: 'email' } },
      },
      error: null,
    });
    render(
      <Wrap>
        <LoginScreen />
      </Wrap>,
    );
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'pwpwpwpw');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(handlers.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.c',
      password: 'pwpwpwpw',
    });
    expect(push).toHaveBeenCalledWith('/main');
  });

  it('shows an error alert and does not navigate on bad credentials', async () => {
    handlers.signInWithPassword.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid login credentials' },
    });
    render(
      <Wrap>
        <LoginScreen />
      </Wrap>,
    );
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'wrongpwd');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/이메일 또는 비밀번호/);
    expect(push).not.toHaveBeenCalled();
  });
});

describe('LoginScreen — Google button (US1 stub → US4 wiring)', () => {
  it('renders a Google button that delegates to signInWithOAuth', async () => {
    render(
      <Wrap>
        <LoginScreen />
      </Wrap>,
    );
    const btn = screen.getByRole('button', { name: /Google/ });
    expect(btn).toBeInTheDocument();
    await userEvent.click(btn);
    expect(handlers.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' }),
    );
  });
});
