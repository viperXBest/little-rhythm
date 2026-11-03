import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { parseDiaper, parseFeed, type EventRow } from '@/lib/events';
import { supabase } from '@/lib/supabase';
import { TREND_MAX_RANGE, trendsFromMs, type TrendEvent } from '@/lib/trends';

// PostgREST returns at most 1000 rows (supabase/config.toml max_rows). 14 days of one baby's log is
// far below that; newest first, so if it were ever hit the oldest day would be the short one.
const MAX_ROWS = 1000;

type TrendRow = Pick<EventRow, 'type' | 'started_at' | 'ended_at' | 'details'>;

/** An event row as the trends engine reads it, with the feed and diaper details parsed. */
export function toTrendEvent(row: TrendRow): TrendEvent {
  return {
    type: row.type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    feed: row.type === 'feed' ? parseFeed(row.details) : null,
    diaper: row.type === 'diaper' ? parseDiaper(row.details) : null,
  };
}

/**
 * The baby's events that started between `from` and now, or null on failure. RLS scopes the select to
 * the caller's family. An open sleep older than `from` is not fetched (it would be a forgotten stop).
 */
async function fetchTrendEvents(babyId: string, from: Date): Promise<TrendEvent[] | null> {
  const { data, error } = await supabase
    .from('events')
    .select('type, started_at, ended_at, details')
    .eq('baby_id', babyId)
    .gte('started_at', from.toISOString())
    .lte('started_at', new Date().toISOString())
    .order('started_at', { ascending: false })
    .limit(MAX_ROWS);
  return error ? null : data.map(toTrendEvent);
}

type TrendEvents = {
  /** `error` only while there is nothing to show; a failed refresh keeps the last events (see `stale`). */
  status: 'loading' | 'ready' | 'error';
  events: TrendEvent[];
  /** True when the last refresh failed and `events` are from an earlier fetch. */
  stale: boolean;
  /** True while a pull-to-refresh is running. */
  refreshing: boolean;
  /** Pull-to-refresh: fetches again and drives `refreshing`. */
  refresh: () => Promise<void>;
  /** Fetches again without the refresh spinner (the Try again button). */
  retry: () => void;
};

/**
 * The events behind the 7- and 14-day views: one fetch for the longer one, so switching the view
 * needs no request. Refetches when the screen gains focus, when the app comes back to the foreground
 * and when the local day changes (`now` is the screen's clock).
 */
export function useTrendEvents(babyId: string, now: Date): TrendEvents {
  const [events, setEvents] = useState<TrendEvent[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  // Changes only when the local day does.
  const from = trendsFromMs(TREND_MAX_RANGE, now);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const result = await fetchTrendEvents(babyId, new Date(from));
    // A newer request wins.
    if (id !== requestId.current) return;
    if (result) {
      setEvents(result);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, [babyId, from]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    return () => sub.remove();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return {
    status: events ? 'ready' : failed ? 'error' : 'loading',
    events: events ?? [],
    stale: events !== null && failed,
    refreshing,
    refresh,
    retry: () => void load(),
  };
}
