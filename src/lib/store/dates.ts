// Pure date helpers. "Today" was a fixed 2026-05-15 constant in Feature 001
// (prototype demo day). Feature 002 swaps it for the real system clock so the
// cloud app reflects actual time. Tests pin the clock via vi.setSystemTime in
// tests/setup.ts to keep assertions deterministic.

import type { Task } from '@/lib/types';

const DOWS = ['일', '월', '화', '수', '목', '금', '토'];

/** Wall-clock "today" — a fresh Date on every call. */
export function today(): Date {
  return new Date();
}

/** Wall-clock "today" formatted as 'YYYY-MM-DD' (local). */
export function todayKey(): string {
  return fmtKey(today());
}

/** Parse a 'YYYY-MM-DD' key as a LOCAL date (avoids the UTC-midnight shift
 *  that `new Date('YYYY-MM-DD')` introduces in negative-offset timezones). */
export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDay(d: string | Date): string {
  const date = typeof d === 'string' ? parseKey(d) : d;
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function fmtKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function relDay(key: string): string | null {
  if (!key) return null;
  const d = parseKey(key);
  const diff = Math.round((d.getTime() - today().getTime()) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === -1) return '어제';
  if (diff > 1 && diff < 7) return `${diff}일 후`;
  if (diff < -1 && diff > -7) return `${-diff}일 전`;
  return `${d.getMonth() + 1}/${d.getDate()} (${DOWS[d.getDay()]})`;
}

export function isOverdue(t: Task): boolean {
  if (!t.due || t.done) return false;
  return t.due < todayKey();
}

export function isToday(t: Task): boolean {
  return t.due === todayKey();
}

export function isUpcoming(t: Task): boolean {
  return Boolean(t.due) && t.due > todayKey();
}
