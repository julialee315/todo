import { describe, it, expect } from 'vitest';
import { savePreference } from '@/lib/supabase-store/preferences';
import { makeClient } from '../../helpers/supabase-mock';

const USER = '00000000-0000-0000-0000-000000000001';

describe('savePreference', () => {
  it('upserts only the keys the caller provided, with user_id stamped', async () => {
    const client = makeClient({ user_preferences: { data: null, error: null } });
    await savePreference(client as any, USER, { theme: 'dark' });
    const chain = client._last.user_preferences;
    expect(chain.upsert).toHaveBeenCalledWith({ user_id: USER, theme: 'dark' });
  });

  it('passes multi-key patches through (view + sort)', async () => {
    const client = makeClient({ user_preferences: { data: null, error: null } });
    await savePreference(client as any, USER, { view: 'today', sort: 'priority' });
    const chain = client._last.user_preferences;
    expect(chain.upsert).toHaveBeenCalledWith({
      user_id: USER,
      view: 'today',
      sort: 'priority',
    });
  });

  it('skips the call when patch is empty', async () => {
    const client = makeClient();
    await savePreference(client as any, USER, {});
    expect(client.from).not.toHaveBeenCalled();
  });
});
