import { describe, it, expect } from 'vitest';
import {
  today,
  todayKey,
  fmtDay,
  fmtKey,
  relDay,
  isOverdue,
  isToday,
  isUpcoming,
} from '@/lib/store/dates';
import type { Task } from '@/lib/types';

// Minimal task builder — only the fields the date predicates read.
function task(due: string, done = false): Task {
  return {
    id: 'x',
    title: 't',
    due,
    priority: 'none',
    category: 'dev',
    starred: false,
    done,
    notes: '',
    subs: [],
  };
}

// "today" now comes from the real system clock; tests/setup.ts pins it to
// 2026-05-15 via vi.setSystemTime so every assertion below behaves like the
// pre-cloud TODAY constant did.

describe('today() / todayKey() resolve to the pinned test clock', () => {
  it('today() returns May 15 2026 (local) under tests/setup.ts', () => {
    const d = today();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(15);
  });

  it('todayKey() matches', () => {
    expect(todayKey()).toBe('2026-05-15');
  });
});

describe('fmtDay', () => {
  it('formats a YYYY-MM-DD string', () => {
    expect(fmtDay('2026-05-15')).toBe('5월 15일');
    expect(fmtDay('2026-12-01')).toBe('12월 1일');
  });

  it('formats a Date', () => {
    expect(fmtDay(new Date(2026, 0, 3))).toBe('1월 3일');
  });
});

describe('fmtKey', () => {
  it('formats a Date as zero-padded YYYY-MM-DD', () => {
    expect(fmtKey(new Date(2026, 4, 15))).toBe('2026-05-15');
    expect(fmtKey(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

describe('relDay (relative to 2026-05-15, a Friday)', () => {
  it('returns null for empty input', () => {
    expect(relDay('')).toBeNull();
  });

  it('today / tomorrow / yesterday', () => {
    expect(relDay('2026-05-15')).toBe('오늘');
    expect(relDay('2026-05-16')).toBe('내일');
    expect(relDay('2026-05-14')).toBe('어제');
  });

  it('within a week future/past', () => {
    expect(relDay('2026-05-18')).toBe('3일 후');
    expect(relDay('2026-05-12')).toBe('3일 전');
  });

  it('beyond a week falls back to M/D (요일)', () => {
    expect(relDay('2026-05-25')).toBe('5/25 (월)');
    expect(relDay('2026-05-01')).toBe('5/1 (금)');
  });
});

describe('isOverdue', () => {
  it('true when due before today and not done', () => {
    expect(isOverdue(task('2026-05-14'))).toBe(true);
  });
  it('false when done, or due today/future, or no due', () => {
    expect(isOverdue(task('2026-05-14', true))).toBe(false);
    expect(isOverdue(task('2026-05-15'))).toBe(false);
    expect(isOverdue(task('2026-05-16'))).toBe(false);
    expect(isOverdue(task(''))).toBe(false);
  });
});

describe('isToday', () => {
  it('true only when due is exactly today', () => {
    expect(isToday(task('2026-05-15'))).toBe(true);
    expect(isToday(task('2026-05-14'))).toBe(false);
    expect(isToday(task('2026-05-16'))).toBe(false);
    expect(isToday(task(''))).toBe(false);
  });
});

describe('isUpcoming', () => {
  it('true only when due is after today', () => {
    expect(isUpcoming(task('2026-05-16'))).toBe(true);
    expect(isUpcoming(task('2026-05-15'))).toBe(false);
    expect(isUpcoming(task('2026-05-14'))).toBe(false);
    expect(isUpcoming(task(''))).toBe(false);
  });
});
