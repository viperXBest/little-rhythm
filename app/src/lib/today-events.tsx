import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { useNow } from '@/hooks/use-now';
import {
  deleteEvent,
  insertEvent,
  overlapsDay,
  startOfToday,
  stopSleep,
  updateEvent,
  type EventPatch,
  type EventRow,
  type WriteError,
} from '@/lib/events';
import { supabase } from '@/lib/supabase';

type TodayEvents = {
  /** Events overlapping today, newest first. */
  events: EventRow[];
  openSleep: EventRow | null;
  status: 'loading' | 'ready' | 'error';
  now: Date;
  find: (id: string) => EventRow | undefined;
  refresh: () => Promise<void>;
  add: (row: EventRow) => Promise<WriteError | null>;
  update: (id: string, patch: EventPatch) => Promise<WriteError | null>;
  /** Ends an open sleep at `endedAt` (default now). */
  endSleep: (id: string, endedAt?: Date) => Promise<WriteError | null>;
  remove: (id: string) => Promise<WriteError | null>;
};

const TodayEventsContext = createContext<TodayEvents | null>(null);

type Rows = ReadonlyMap<string, EventRow>;

function withRow(rows: Rows, row: EventRow): Rows {
  const next = new Map(rows);
  next.set(row.id, row);
  return next;
}

function withoutRow(rows: Rows, id: string): Rows {
  if (!rows.has(id)) return rows;
  const next = new Map(rows);
  next.delete(id);
  return next;
}

/** Events overlapping the day, plus any open sleep, or null on failure. Feeds and diapers have no ended_at. */
async function fetchToday(babyId: string, dayStart: Date): Promise<EventRow[] | null> {
  const since = dayStart.toISOString();
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('baby_id', babyId)
    .or(`started_at.gte.${since},ended_at.gte.${since},and(type.eq.sleep,ended_at.is.null)`)
    .order('started_at', { ascending: false })
    .limit(200);
  return error ? null : data;
}

/**
 * Today's events for one baby. Rows are keyed by id, so an optimistic insert and
 * its realtime echo (or a refetch) merge instead of duplicating.
 */
export function TodayEventsProvider({ babyId, children }: { babyId: string; children: ReactNode }) {
  const [rows, setRows] = useState<Rows>(new Map());
  const [status, setStatus] = useState<TodayEvents['status']>('loading');
  // Inserts still in flight: a refetch must not drop them.
  const pending = useRef(new Set<string>());
  const now = useNow();
  const dayStart = startOfToday(now).getTime();

  const apply = useCallback((rowsFromServer: EventRow[] | null) => {
    if (!rowsFromServer) {
      setStatus((prev) => (prev === 'ready' ? prev : 'error'));
      return;
    }
    setRows((prev) => {
      const next = new Map(rowsFromServer.map((row) => [row.id, row]));
      for (const id of pending.current) {
        const row = prev.get(id);
        if (row && !next.has(id)) next.set(id, row);
      }
      return next;
    });
    setStatus('ready');
  }, []);

  const refresh = useCallback(async () => {
    apply(await fetchToday(babyId, new Date(dayStart)));
  }, [apply, babyId, dayStart]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    void (async () => {
      // Subscribe with the user's JWT so RLS applies to the stream.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      const filter = `baby_id=eq.${babyId}`;
      channel = supabase
        .channel(`events:${babyId}`)
        .on<EventRow>(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'events', filter },
          (payload) => setRows((prev) => withRow(prev, payload.new)),
        )
        .on<EventRow>(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'events', filter },
          (payload) => setRows((prev) => withRow(prev, payload.new)),
        )
        // DELETE can't be filtered and carries only the id: drop it if we have it.
        .on<EventRow>(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'events' },
          (payload) => {
            const id = payload.old.id;
            if (id) setRows((prev) => withoutRow(prev, id));
          },
        )
        .subscribe((state) => {
          // Covers anything missed before (re)subscribing.
          if (state === 'SUBSCRIBED') void refresh();
        });
    })();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [babyId, refresh]);

  useEffect(() => {
    let cancelled = false;
    void fetchToday(babyId, new Date(dayStart)).then((result) => {
      if (!cancelled) apply(result);
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [apply, babyId, dayStart, refresh]);

  const add = useCallback(
    async (row: EventRow) => {
      pending.current.add(row.id);
      setRows((prev) => withRow(prev, row));
      const error = await insertEvent(row);
      pending.current.delete(row.id);
      if (error) {
        setRows((prev) => withoutRow(prev, row.id));
        if (error === 'sleep_already_open') await refresh();
      }
      return error;
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, patch: EventPatch) => {
      const before = rows.get(id);
      if (!before) return 'failed' as const;
      setRows((prev) => withRow(prev, { ...before, ...patch }));
      const error = await updateEvent(id, patch);
      if (error) setRows((prev) => (prev.has(id) ? withRow(prev, before) : prev));
      return error;
    },
    [rows],
  );

  const endSleep = useCallback(
    async (id: string, endedAt: Date = new Date()) => {
      const before = rows.get(id);
      if (!before) return 'failed' as const;
      setRows((prev) => withRow(prev, { ...before, ended_at: endedAt.toISOString() }));
      const error = await stopSleep(id, endedAt);
      if (error) setRows((prev) => (prev.has(id) ? withRow(prev, before) : prev));
      return error;
    },
    [rows],
  );

  const remove = useCallback(
    async (id: string) => {
      const before = rows.get(id);
      if (!before) return null;
      setRows((prev) => withoutRow(prev, id));
      const error = await deleteEvent(id);
      if (error) setRows((prev) => withRow(prev, before));
      return error;
    },
    [rows],
  );

  const today = new Date(dayStart);
  const events = [...rows.values()]
    .filter((row) => row.baby_id === babyId && overlapsDay(row, today))
    // Compare as times: server rows use "+00:00", rows built on the phone use "Z".
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
  const openSleep = events.find((row) => row.type === 'sleep' && row.ended_at === null) ?? null;

  return (
    <TodayEventsContext.Provider
      value={{
        events,
        openSleep,
        status,
        now,
        find: (id) => rows.get(id),
        refresh,
        add,
        update,
        endSleep,
        remove,
      }}>
      {children}
    </TodayEventsContext.Provider>
  );
}

export function useTodayEvents(): TodayEvents {
  const value = useContext(TodayEventsContext);
  if (!value) throw new Error('useTodayEvents must be used inside TodayEventsProvider');
  return value;
}
