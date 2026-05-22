import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/context/ThemeProvider';
import { TasksProvider } from '@/context/TasksProvider';
import { MainScreen } from '@/components/main/MainScreen';

// Integration coverage for US6: the persistence + theme mechanism, exercised
// through the real provider + screen composition (not the units in isolation).

const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  push: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: nav.push }),
}));

vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }),
}));

beforeEach(() => {
  nav.params = new URLSearchParams();
  document.documentElement.removeAttribute('data-theme');
});

function App() {
  return (
    <ThemeProvider>
      <TasksProvider>
        <MainScreen />
      </TasksProvider>
    </ThemeProvider>
  );
}

describe('app integration — persistence & theme (US6)', () => {
  it('seeds the sample tasks on first run', () => {
    render(<App />);
    expect(
      screen.getByText('Q4 디자인 시스템 토큰 마이그레이션 리뷰'),
    ).toBeInTheDocument();
  });

  it('persists an added task across a remount', async () => {
    const { unmount } = render(<App />);
    await userEvent.type(
      screen.getByPlaceholderText(/할 일을 추가하세요/),
      '영속성 테스트 작업{Enter}',
    );
    expect(screen.getByText('영속성 테스트 작업')).toBeInTheDocument();

    unmount();
    render(<App />);
    expect(screen.getByText('영속성 테스트 작업')).toBeInTheDocument();
  });

  it('persists the theme across a remount', async () => {
    const { unmount } = render(<App />);
    expect(document.documentElement.dataset.theme).toBe('light');

    await userEvent.click(screen.getByRole('switch', { name: /테마/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');

    unmount();
    render(<App />);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
