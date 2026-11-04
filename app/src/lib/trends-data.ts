import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { parseDiaper, parseFeed, type EventRow } from '@/lib/events';
import { supabase } from '@/lib/supabase';
import { useTodayEvents } from '@/lib/today-events';
import { TREND_MAX_RANGE, trendsFromMs, type TrendEvent } from '@/lib/trends';

// PostgREST returns at most 1000 rows per request (supabase/config.toml max_rows), so the fetch pages.
// 14 days of two parents logging is far below 5 pages; if it were ever hit the numbers would be
// partial, so that counts as a failure rather than a short chart.
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
/** A change to today's log (a partner's tap, a chat confirm) refetches after this long. */
const REFRESH_DEBOUNCE_MS = 2000;

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
 * The baby's events from `from` on, or null on failure. RLS scopes the select to the caller's family.
 * Same filter as the Today list: events that started at or after `from`, sleeps that ended after it,
 * and the open sleep (whenever it started). Feeds and diapers have no ended_at.
 */
async function fetchTrendEvents(babyId: string, from: Date): Promise<TrendEvent[] | null> {
  const since = from.toISOString();
  const rows: TrendEvent[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('events')
      .select('type, started_at, ended_at, details')
      .eq('baby_id', babyId)
      .or(`started_at.gte.${since},ended_at.gt.${since},and(type.eq.sleep,ended_at.is.null)`)
      // The id breaks ties, so a page boundary never repeats or skips a row.
      .order('started_at', { ascending: false })
      .order('id')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) return null;
    rows.push(...data.map(toTrendEvent));
    if (data.length < PAGE_SIZE) return rows;
  }
  return null;
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
  /** Fetches again without the refresh spinner (the Try again buttons); clears the failure at once. */
  retry: () => void;
};

/**
 * The events behind the 7- and 14-day views: one fetch for the longer one, so switching the view
 * needs no request. Refetches when the screen gains focus, when the app comes back to the foreground,
 * when the local day changes (`now` is the screen's clock) and when today's log changes (the same
 * realtime feed as Home, so a partner's logs show up here too).
 */
export function useTrendEvents(babyId: string, now: Date): TrendEvents {
  const { events: todayEvents, status: todayStatus, revision } = useTodayEvents();
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

  // The revision also includes backdated entries, which today's visible list does not contain.
  // The first load of today's events is the baseline, not a change.
  const signature = `${revision}|${todayEvents
    .map((e) => `${e.id}:${e.started_at}:${e.ended_at ?? ''}:${JSON.stringify(e.details)}`)
    .join('|')}`;
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    if (todayStatus !== 'ready') return;
    const previous = lastSignature.current;
    lastSignature.current = signature;
    if (previous === null || previous === signature) return;
    const timer = setTimeout(() => void load(), REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [todayStatus, signature, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const retry = useCallback(() => {
    setFailed(false);
    void load();
  }, [load]);

  return {
    status: events ? 'ready' : failed ? 'error' : 'loading',
    events: events ?? [],
    stale: events !== null && failed,
    refreshing,
    refresh,
    retry,
  };
}
