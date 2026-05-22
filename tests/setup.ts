import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Pin the system clock to 2026-05-15 (the prototype's demo day) so the date
// predicates in src/lib/store/dates.ts produce deterministic results in tests
// — even after dates.ts itself was migrated from a TODAY constant to today()
// (Feature 002, R7). Tests that need a different "now" can call
// vi.setSystemTime() locally inside their own beforeEach.
beforeEach(() => {
  vi.setSystemTime(new Date('2026-05-15T09:00:00+09:00'));
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});
