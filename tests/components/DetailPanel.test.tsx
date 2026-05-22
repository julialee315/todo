import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// Mock the now cloud-driven providers so DetailPanel sees SAMPLE_TASKS and
// can fire mutation callbacks against the (mocked) supabase round-trip.
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

import { DetailPanel } from '@/components/main/DetailPanel';
import { TasksProvider } from '@/context/TasksProvider';

const onClearSelection = vi.fn();
beforeEach(() => onClearSelection.mockClear());

function renderDetail(selectedId: string | null) {
  return render(
    <TasksProvider>
      <DetailPanel selectedId={selectedId} onClearSelection={onClearSelection} />
    </TasksProvider>,
  );
}

describe('DetailPanel', () => {
  it('shows the empty state when nothing is selected', () => {
    renderDetail(null);
    expect(screen.getByText('선택된 할 일이 없습니다')).toBeInTheDocument();
  });

  it('renders the selected task: title, due, priority, category', () => {
    renderDetail('t1');
    expect(
      screen.getByDisplayValue('Q4 디자인 시스템 토큰 마이그레이션 리뷰'),
    ).toBeInTheDocument();
    expect(screen.getByText('5월 15일')).toBeInTheDocument(); // due
    expect(screen.getByText('높음')).toBeInTheDocument(); // priority
    expect(screen.getByText('디자인')).toBeInTheDocument(); // category
  });

  it('edits the title', async () => {
    renderDetail('t1');
    const title = screen.getByDisplayValue(
      'Q4 디자인 시스템 토큰 마이그레이션 리뷰',
    );
    await userEvent.clear(title);
    await userEvent.type(title, '수정된 제목');
    expect(screen.getByDisplayValue('수정된 제목')).toBeInTheDocument();
  });

  it('edits notes', async () => {
    renderDetail('t2'); // t2 starts with empty notes
    const notes = screen.getByPlaceholderText(/메모를 남겨두세요/);
    await userEvent.type(notes, '새 메모');
    expect(screen.getByDisplayValue('새 메모')).toBeInTheDocument();
  });

  it('changes priority via the inline popover', async () => {
    renderDetail('t1'); // priority high
    await userEvent.click(screen.getByRole('button', { name: /우선순위/ }));
    await userEvent.click(screen.getByRole('option', { name: /낮음/ }));
    expect(
      screen.getByRole('button', { name: /우선순위/ }),
    ).toHaveTextContent('낮음');
  });

  it('changes category via the inline popover', async () => {
    renderDetail('t1'); // category design
    await userEvent.click(screen.getByRole('button', { name: /카테고리/ }));
    await userEvent.click(screen.getByRole('option', { name: /개발/ }));
    expect(
      screen.getByRole('button', { name: /카테고리/ }),
    ).toHaveTextContent('개발');
  });

  it('adds, toggles, and deletes subtasks', async () => {
    renderDetail('t1');
    // add
    const subInput = screen.getByPlaceholderText('서브태스크 추가');
    await userEvent.type(subInput, '새 서브태스크{Enter}');
    expect(screen.getByText('새 서브태스크')).toBeInTheDocument();

    // toggle — s3 ("Pretendard fallback 체인 정리") starts not done
    const s3 = screen.getByRole('checkbox', {
      name: /Pretendard fallback 체인 정리/,
    });
    expect(s3).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(s3);
    expect(
      screen.getByRole('checkbox', { name: /Pretendard fallback 체인 정리/ }),
    ).toHaveAttribute('aria-checked', 'true');

    // delete s3
    await userEvent.click(
      screen.getByRole('button', { name: /Pretendard fallback 체인 정리 삭제/ }),
    );
    expect(
      screen.queryByText('Pretendard fallback 체인 정리'),
    ).not.toBeInTheDocument();
  });

  it('shows the subtask progress bar when subtasks exist', () => {
    renderDetail('t1'); // 4 subs, 2 done
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
  });

  it('deletes the task and clears the selection', async () => {
    renderDetail('t1');
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
    expect(screen.getByText('선택된 할 일이 없습니다')).toBeInTheDocument();
  });

  it('toggles the star', async () => {
    renderDetail('t1'); // starred: true
    const star = screen.getByRole('button', { name: '즐겨찾기' });
    expect(star).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(star);
    expect(
      screen.getByRole('button', { name: '즐겨찾기' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
