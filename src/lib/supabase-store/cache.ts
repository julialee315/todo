// Last-known-good snapshot of the user's tasks, written after every
// successful sync and used to keep the UI populated when the browser is
// offline. NOT a write queue — offline edits are blocked by the Provider;
// this exists only so the read view doesn't go blank.
//
// Per Constitution v1.1.0: localStorage is allowed for local UI cache only.
// Authoritative state lives in Supabase.

import type { Task } from '@/lib/types';

const SNAPSHOT_KEY = 'demodev-tasks:cloud-snapshot';

export function saveSnapshot(tasks: Task[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(tasks));
  } catch {
    // Quota errors are not fatal — the next render still has in-memory state.
  }
}

export function loadSnapshot(): Task[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Task[]) : null;
  } catch {
    return null;
  }
}

export function clearSnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    // ignored — same rationale as save
  }
}
