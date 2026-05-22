import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const signOut = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ signOut }),
}));

import { LogoutButton } from '@/components/shared/LogoutButton';

beforeEach(() => signOut.mockClear());

describe('LogoutButton', () => {
  it('renders with an accessible name', () => {
    render(<LogoutButton />);
    expect(
      screen.getByRole('button', { name: '로그아웃' }),
    ).toBeInTheDocument();
  });

  it('calls signOut on click', async () => {
    render(<LogoutButton />);
    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
