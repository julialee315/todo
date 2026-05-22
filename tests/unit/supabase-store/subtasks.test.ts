import { describe, it, expect } from 'vitest';
import {
  addSubtask,
  updateSubtask,
  deleteSubtask,
} from '@/lib/supabase-store/subtasks';
import { makeClient } from '../../helpers/supabase-mock';

const TASK = 'task-uuid';
const SUB = 'sub-uuid';

describe('addSubtask', () => {
  it('rejects whitespace-only text', async () => {
    const client = makeClient();
    await expect(addSubtask(client as any, TASK, '   ')).rejects.toThrow();
    expect(client.from).not.toHaveBeenCalled();
  });

  it('inserts a subtask under the given task and returns the domain shape', async () => {
    const inserted = {
      id: SUB,
      task_id: TASK,
      user_id: 'irrelevant — trigger sets it',
      text: 'new sub',
      done: false,
      sort_order: 0,
      created_at: '',
      updated_at: '',
    };
    const client = makeClient({ subtasks: { data: inserted, error: null } });
    const result = await addSubtask(client as any, TASK, '  new sub  ');
    expect(result).toEqual({ id: SUB, text: 'new sub', done: false });
    const chain = client._last.subtasks;
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: TASK, text: 'new sub' }),
    );
    // user_id MUST be omitted — the BEFORE INSERT trigger sets it.
    const arg = (chain.insert as any).mock.calls[0][0];
    expect('user_id' in arg).toBe(false);
  });
});

describe('updateSubtask', () => {
  it('updates done/text and filters by id', async () => {
    const client = makeClient({ subtasks: { data: null, error: null } });
    await updateSubtask(client as any, SUB, { done: true, text: 'edited' });
    const chain = client._last.subtasks;
    expect(chain.update).toHaveBeenCalledWith({ done: true, text: 'edited' });
    expect(chain.eq).toHaveBeenCalledWith('id', SUB);
  });

  it('skips the call when the patch is empty', async () => {
    const client = makeClient();
    await updateSubtask(client as any, SUB, {});
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe('deleteSubtask', () => {
  it('deletes by id', async () => {
    const client = makeClient({ subtasks: { data: null, error: null } });
    await deleteSubtask(client as any, SUB);
    const chain = client._last.subtasks;
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('id', SUB);
  });
});
