// Adapter for the user_preferences row. We always upsert by user_id (the
// table's primary key), so a brand-new user gets a row on their first save
// and existing users get a patch.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserPreference } from '@/lib/types';
import { domainPreferenceToDbUpsert } from '@/lib/supabase-store/mappers';

export async function savePreference(
  client: SupabaseClient,
  userId: string,
  patch: Partial<UserPreference>,
): Promise<void> {
  const payload = domainPreferenceToDbUpsert(patch, userId);
  // payload always has user_id; if no other keys, skip the write.
  if (Object.keys(payload).length <= 1) return;
  const { error } = await client.from('user_preferences').upsert(payload);
  if (error) throw error;
}
