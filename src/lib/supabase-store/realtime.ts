// Realtime subscription for the current user's task corpus.
// Opens a single Supabase channel and binds three postgres_changes handlers
// (tasks / subtasks / user_preferences) scoped to `user_id=eq.${userId}`.
// RLS already enforces this scope server-side; the filter saves bandwidth
// and acts as a second layer of defence.
//
// Contract: specs/002-cloud-sync-multiuser/contracts/realtime.md.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DbPreferenceRow,
  DbSubtaskRow,
  DbTaskRow,
  RealtimeChange,
  RealtimeEvent,
  RealtimeTable,
} from '@/lib/types';

type PgChange<R> = {
  eventType: RealtimeEvent;
  new: R | null;
  old: R | null;
};

// supabase-js identifies channels by name globally; if two callers (e.g.
// TasksProvider + ThemeProvider) opened a channel with the same name we'd
// end up trying to .on() bind extra handlers AFTER subscribe(), which the
// realtime client refuses. A short random suffix per call avoids that — the
// websocket connection is still multiplexed, so the extra "channels" are
// cheap.
function uniqueChannelName(userId: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `tasks-by-user-${userId}-${suffix}`;
}

export function subscribeToUserChanges(
  client: SupabaseClient,
  userId: string,
  onChange: (change: RealtimeChange) => void,
): () => void {
  const channel = client.channel(uniqueChannelName(userId));

  const bind = <R>(table: RealtimeTable) => {
    // The supabase-js Channel type for postgres_changes is complex; cast at
    // the boundary keeps the rest of the code typed.
    (channel as any).on(
      'postgres_changes',
      { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
      (payload: PgChange<R>) => {
        onChange({
          table,
          event: payload.eventType,
          new: payload.new as never,
          old: payload.old as never,
        });
      },
    );
  };

  bind<DbTaskRow>('tasks');
  bind<DbSubtaskRow>('subtasks');
  bind<DbPreferenceRow>('user_preferences');

  channel.subscribe();

  return () => {
    channel.unsubscribe();
  };
}
