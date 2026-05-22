import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarScreen } from '@/components/calendar/CalendarScreen';
import { TasksProvider } from '@/context/TasksProvider';
import { ThemeProvider } from '@/context/ThemeProvider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ user: null, loading: false, signOut: vi.fn() }),
}));

vi.mock('@/context/TasksProvider', async () => {
  const { SAMPLE_TASKS } = await import('@/lib/store/sample-data');
  const fake = await import('../helpers/fake-providers');
  return {
    TasksProvider: ({ children }: { children: React.ReactNode }) => (
      <fake.FakeTasksProvider initialTasks={SAMPLE_TASKS}>
        {children}
      </fake.FakeTasksProvider>
    ),
    useTasks: fake.useFakeTasks,
  };
});

vi.mock('@/context/ThemeProvider', async () => {
  const fake = await import('../helpers/fake-providers');
  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) => (
      <fake.FakeThemeProvider>{children}</fake.FakeThemeProvider>
    ),
    useTheme: fake.useFakeTheme,
  };
});

function renderCalendar() {
  return render(
    <ThemeProvider>
      <TasksProvider>
        <CalendarScreen />
      </TasksProvider>
    </ThemeProvider>,
  );
}

describe('CalendarScreen', () => {
  it('renders May 2026 as a 6-week (42-cell) grid', () => {
    const { container } = renderCalendar();
    expect(screen.getByRole('heading', { name: '5월' })).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(container.querySelectorAll('.cell')).toHaveLength(42);
  });

  it('highlights today (May 15)', () => {
    const { container } = renderCalendar();
    const today = container.querySelector('.cell.is-today');
    expect(today).not.toBeNull();
    expect(today).toHaveTextContent('15');
  });

  it('renders task events in their date cells with a "+N개 더" overflow', () => {
    renderCalendar();
    // t6 is due 2026-05-16; the selected day defaults to 05-15 so it only
    // appears in the grid, not the preview panel.
    expect(
      screen.getByText('신규 클라이언트 킥오프 미팅 준비'),
    ).toBeInTheDocument();
    // 2026-05-15 has 4 tasks → 3 shown + "+ 1개 더"
    expect(screen.getByText(/1개 더/)).toBeInTheDocument();
  });

  it('shows the selected day in the preview panel and updates on date click', async () => {
    renderCalendar();
    expect(screen.getByText('5월 15일')).toBeInTheDocument(); // default selection
    await userEvent.click(screen.getByText('16')); // click the May 16 cell
    expect(screen.getByText('5월 16일')).toBeInTheDocument();
  });

  it('navigates months with 다음 달 / 오늘', async () => {
    renderCalendar();
    await userEvent.click(screen.getByRole('button', { name: '다음 달' }));
    expect(screen.getByRole('heading', { name: '6월' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '오늘로 이동' }));
    expect(screen.getByRole('heading', { name: '5월' })).toBeInTheDocument();
  });
});
