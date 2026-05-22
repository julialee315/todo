import { describe, it, expect } from 'vitest';
import {
  dbTaskToDomain,
  domainTaskToDbInsert,
  dbSubtaskToDomain,
  domainSubtaskToDbInsert,
  dbPreferenceToDomain,
  domainPreferenceToDbUpsert,
} from '@/lib/supabase-store/mappers';
import type {
  DbPreferenceRow,
  DbSubtaskRow,
  DbTaskRow,
  Subtask,
  Task,
  UserPreference,
} from '@/lib/types';

const TS = '2026-05-15T00:00:00+00:00';
const USER = '00000000-0000-0000-0000-000000000001';
const TASK = '11111111-1111-1111-1111-111111111111';
const SUB = '22222222-2222-2222-2222-222222222222';

function row(overrides: Partial<DbTaskRow> = {}): DbTaskRow {
  return {
    id: TASK,
    user_id: USER,
    title: '제목',
    due: '2026-05-15',
    priority: 'high',
    category: 'design',
    starred: true,
    done: false,
    notes: '',
    created_at: TS,
    updated_at: TS,
    ...overrides,
  };
}

function subRow(overrides: Partial<DbSubtaskRow> = {}): DbSubtaskRow {
  return {
    id: SUB,
    task_id: TASK,
    user_id: USER,
    text: '서브',
    done: false,
    sort_order: 0,
    created_at: TS,
    updated_at: TS,
    ...overrides,
  };
}

describe('dbTaskToDomain', () => {
  it('maps a normal row 1:1 and joins the provided subtasks', () => {
    const subs: DbSubtaskRow[] = [
      subRow({ id: 's1', text: 'first', sort_order: 0 }),
      subRow({ id: 's2', text: 'second', sort_order: 1 }),
    ];
    const result = dbTaskToDomain(row(), subs);
    expect(result).toEqual<Task>({
      id: TASK,
      title: '제목',
      due: '2026-05-15',
      priority: 'high',
      category: 'design',
      starred: true,
      done: false,
      notes: '',
      subs: [
        { id: 's1', text: 'first', done: false },
        { id: 's2', text: 'second', done: false },
      ],
    });
  });

  it("maps DB due: null → domain due: ''", () => {
    expect(dbTaskToDomain(row({ due: null }), []).due).toBe('');
  });

  it('orders subs by sort_order regardless of input order', () => {
    const subs = [
      subRow({ id: 'late', sort_order: 9 }),
      subRow({ id: 'early', sort_order: 1 }),
      subRow({ id: 'mid', sort_order: 5 }),
    ];
    expect(dbTaskToDomain(row(), subs).subs.map((s) => s.id)).toEqual([
      'early',
      'mid',
      'late',
    ]);
  });
});

describe('domainTaskToDbInsert', () => {
  it('passes through scalar fields and stamps user_id', () => {
    const input: Partial<Task> = {
      title: '새 할 일',
      due: '2026-06-01',
      priority: 'med',
      category: 'dev',
      starred: false,
      done: false,
      notes: 'note',
    };
    expect(domainTaskToDbInsert(input, USER)).toEqual({
      user_id: USER,
      title: '새 할 일',
      due: '2026-06-01',
      priority: 'med',
      category: 'dev',
      starred: false,
      done: false,
      notes: 'note',
    });
  });

  it("maps empty due '' → null so the date column receives NULL", () => {
    expect(domainTaskToDbInsert({ title: 't', due: '' }, USER).due).toBeNull();
  });

  it('omits fields the caller did not provide (lets DB defaults apply)', () => {
    const out = domainTaskToDbInsert({ title: 'minimal' }, USER);
    expect(out).toEqual({ user_id: USER, title: 'minimal' });
    expect('priority' in out).toBe(false);
    expect('starred' in out).toBe(false);
  });
});

describe('dbSubtaskToDomain', () => {
  it('maps row to domain shape (drops task_id/user_id/timestamps)', () => {
    expect(dbSubtaskToDomain(subRow({ text: 'x', done: true }))).toEqual<Subtask>({
      id: SUB,
      text: 'x',
      done: true,
    });
  });
});

describe('domainSubtaskToDbInsert', () => {
  it('stamps task_id and forwards text/done/sort_order; never sets user_id', () => {
    const input: Partial<Subtask> & { sort_order?: number } = {
      text: '체크 1',
      done: false,
      sort_order: 2,
    };
    const out = domainSubtaskToDbInsert(input, TASK);
    expect(out).toEqual({
      task_id: TASK,
      text: '체크 1',
      done: false,
      sort_order: 2,
    });
    expect('user_id' in out).toBe(false); // the BEFORE INSERT trigger sets it
  });

  it('omits done / sort_order when caller did not supply them', () => {
    const out = domainSubtaskToDbInsert({ text: 'only text' }, TASK);
    expect(out).toEqual({ task_id: TASK, text: 'only text' });
  });
});

describe('dbPreferenceToDomain', () => {
  it('extracts the three UI fields, dropping user_id and timestamps', () => {
    const row: DbPreferenceRow = {
      user_id: USER,
      view: 'today',
      sort: 'due_asc',
      theme: 'dark',
      seeded_at: TS,
      updated_at: TS,
    };
    expect(dbPreferenceToDomain(row)).toEqual<UserPreference>({
      view: 'today',
      sort: 'due_asc',
      theme: 'dark',
    });
  });
});

describe('domainPreferenceToDbUpsert', () => {
  it('stamps user_id and forwards only the keys the caller provided', () => {
    expect(domainPreferenceToDbUpsert({ theme: 'dark' }, USER)).toEqual({
      user_id: USER,
      theme: 'dark',
    });
    expect(domainPreferenceToDbUpsert({ view: 'today', sort: 'priority' }, USER)).toEqual({
      user_id: USER,
      view: 'today',
      sort: 'priority',
    });
  });
});
