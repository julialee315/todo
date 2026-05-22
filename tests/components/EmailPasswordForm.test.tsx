import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailPasswordForm } from '@/components/login/EmailPasswordForm';

describe('EmailPasswordForm — signin mode', () => {
  it('renders email + password inputs and a submit button', () => {
    render(<EmailPasswordForm mode="signin" onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
  });

  it('calls onSubmit with the typed credentials when the user submits', async () => {
    const onSubmit = vi.fn(async () => ({ error: null }));
    render(<EmailPasswordForm mode="signin" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'pwpwpwpw');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(onSubmit).toHaveBeenCalledWith('a@b.c', 'pwpwpwpw');
  });

  it('submits via Enter inside the password input', async () => {
    const onSubmit = vi.fn(async () => ({ error: null }));
    render(<EmailPasswordForm mode="signin" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('이메일'), 'x@y.z');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'abcdefgh{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('x@y.z', 'abcdefgh');
  });
});

describe('EmailPasswordForm — signup mode', () => {
  it('uses the signup button label and the same field shape', () => {
    render(<EmailPasswordForm mode="signup" onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: '회원가입' })).toBeInTheDocument();
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toBeInTheDocument();
  });
});

describe('EmailPasswordForm — pending state', () => {
  it('disables the submit button while the onSubmit promise is pending', async () => {
    let resolve!: (v: { error: string | null }) => void;
    const onSubmit = vi.fn(() => new Promise<{ error: string | null }>((r) => {
      resolve = r;
    }));
    render(<EmailPasswordForm mode="signin" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('이메일'), 'a@b.c');
    await userEvent.type(screen.getByLabelText('비밀번호'), 'pwpwpwpw');
    await userEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(screen.getByRole('button', { name: /로그인|진행/ })).toBeDisabled();
    resolve({ error: null });
  });
});
