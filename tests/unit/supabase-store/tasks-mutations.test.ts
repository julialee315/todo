import { describe, it, expect, vi } from 'vitest';
import {
  addTask,
  updateTask,
  deleteTask,
  toggleTaskDone,
  toggleTaskStarred,
} from '@/lib/supabase-store/tasks-mutations';
import { makeChain, makeClient } from '../../helpers/supabase-mock';

const USER = '00000000-0000-0000-0000-000000000001';
const TASK = 'task-uuid';

describe('addTask', () => {
  it('rejects whitespace-only titles before hitting the DB', async () => {
    const client = makeClient();
    await expect(addTask(client as any, USER, { title: '   ' })).rejects.toThrow();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('inserts then returns the row as a domain Task', async () => {
    const inserted = {
      id: 'new',
      user_id: USER,
      title: '제목',
      due: '2026-05-20',
      priority: 'high',
      category: 'design',
      starred: false,
      done: false,
      notes: '',
      created_at: '',
      updated_at: '',
    };
    const client = makeClient({
      tasks: { data: inserted, error: null },
    });
    const result = await addTask(client as any, USER, {
      title: ' 제목 ',
      due: '2026-05-20',
      priority: 'high',
      category: 'design',
    });
    expect(client.from).toHaveBeenCalledWith('tasks');
    expect(result.id).toBe('new');
    expect(result.subs).toEqual([]);
  });
});

describe('updateTask', () => {
  it('skips the network call when the patch is empty', async () => {
    const client = makeClient();
    await updateTask(client as any, TASK, {});
    expect(client.from).not.toHaveBeenCalled();
  });

  it('runs an update with the patch and an id filter', async () => {
    const client = makeClient({
      tasks: { data: null, error: null },
    });
    await updateTask(client as any, TASK, { title: 'x', done: true });
    const chain = client._last.tasks;
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'x', done: true }),
    );
    expect(chain.eq).toHaveBeenCalledWith('id', TASK);
  });
});

describe('deleteTask', () => {
  it('calls delete with the id filter', async () => {
    const client = makeClient({ tasks: { data: null, error: null } });
    await deleteTask(client as any, TASK);
    const chain = client._last.tasks;
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', TASK);
  });
});

describe('toggleTaskDone / toggleTaskStarred', () => {
  it('toggleTaskDone is a thin wrapper over updateTask', async () => {
    const client = makeClient({ tasks: { data: null, error: null } });
    await toggleTaskDone(client as any, TASK, true);
    const chain = client._last.tasks;
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ done: true }),
    );
  });

  it('toggleTaskStarred is a thin wrapper over updateTask', async () => {
    const client = makeClient({ tasks: { data: null, error: null } });
    await toggleTaskStarred(client as any, TASK, false);
    const chain = client._last.tasks;
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ starred: false }),
    );
  });
});
