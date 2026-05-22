import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
vi.mock('@/context/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u', email: 'x' }, loading: false, signOut: vi.fn() }),
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

import { TaskList } from '@/components/main/TaskList';
import { TasksProvider } from '@/context/TasksProvider';
import type { CategoryId, ViewId } from '@/lib/types';

function renderList(
  props: Partial<{
    view: ViewId;
    activeCat: CategoryId | null;
    selectedId: string | null;
  }> = {},
) {
  const onSelectTask = vi.fn();
  render(
    <TasksProvider>
      <TaskList
        view={props.view ?? 'today'}
        activeCat={props.activeCat ?? null}
        selectedId={props.selectedId ?? null}
        onSelectTask={onSelectTask}
      />
    </TasksProvider>,
  );
  return { onSelectTask };
}

describe('TaskList', () => {
  it('renders the view header', () => {
    renderList({ view: 'today' });
    expect(screen.getByRole('heading', { name: /오늘/ })).toBeInTheDocument();
  });

  it('today view shows the 지연 and 오늘 group labels', () => {
    renderList({ view: 'today' });
    expect(screen.getByText('지연 · 2')).toBeInTheDocument();
    expect(screen.getByText('오늘 · 3')).toBeInTheDocument();
  });

  it('adds a task on Enter and clears the input', async () => {
    renderList({ view: 'today' });
    const input = screen.getByPlaceholderText(/할 일을 추가하세요/);
    await userEvent.type(input, '새 테스트 할 일{Enter}');
    expect(screen.getByText('새 테스트 할 일')).toBeInTheDocument();
    expect(input).toHaveValue('');
  });

  it('ignores a blank title (no task added)', async () => {
    renderList({ view: 'today' });
    // "전체" chip shows the pre-filter count for the view (5 from sample data).
    expect(screen.getByRole('button', { name: /전체/ })).toHaveTextContent('5');
    const input = screen.getByPlaceholderText(/할 일을 추가하세요/);
    await userEvent.type(input, '   {Enter}');
    expect(screen.getByRole('button', { name: /전체/ })).toHaveTextContent('5');
  });

  it('filter chip "우선순위 높음" narrows the list to high-priority tasks', async () => {
    renderList({ view: 'today' });
    // t2 is a med-priority task visible in the today view.
    expect(
      screen.getByText('코드 리뷰 — PR #234 인증 모듈 리팩토링'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /우선순위 높음/ }));
    expect(
      screen.queryByText('코드 리뷰 — PR #234 인증 모듈 리팩토링'),
    ).not.toBeInTheDocument();
    // a high-priority task stays
    expect(
      screen.getByText('Q4 디자인 시스템 토큰 마이그레이션 리뷰'),
    ).toBeInTheDocument();
  });

  it('shows an empty state when the view has no tasks', () => {
    // category "personal" has no incomplete tasks in the sample data.
    renderList({ view: 'inbox', activeCat: 'personal' });
    expect(screen.getByText(/할 일이 없습니다/)).toBeInTheDocument();
  });
});
