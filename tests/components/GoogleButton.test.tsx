import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signInWithGoogle = vi.hoisted(() =>
  vi.fn(async () => ({ error: null as string | null })),
);
vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ signInWithGoogle }),
}));

import { GoogleButton } from '@/components/login/GoogleButton';

beforeEach(() => signInWithGoogle.mockClear());

describe('GoogleButton', () => {
  it('renders with an accessible name', () => {
    render(<GoogleButton />);
    expect(
      screen.getByRole('button', { name: 'Google로 계속하기' }),
    ).toBeInTheDocument();
  });

  it('calls signInWithGoogle on click', async () => {
    render(<GoogleButton />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Google로 계속하기' }),
    );
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error to the optional onError callback', async () => {
    signInWithGoogle.mockResolvedValueOnce({ error: 'Google 로그인 실패' });
    const onError = vi.fn();
    render(<GoogleButton onError={onError} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Google로 계속하기' }),
    );
    // microtask flush
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith('Google 로그인 실패');
  });
});
