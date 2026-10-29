import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import { timeZoneName, tzOffsetMinutes } from '@/lib/time-zone';

// Mirrors supabase/functions/_shared/predict.ts. Windows are computed on the
// server only, so the card and the chat always agree.
export type Basis = 'age' | 'personal' | 'blend';
export type PredictWindow = { start: string; end: string; basis: Basis; samples: number };
export type NullReason =
  | 'no_feed_logged'
  | 'no_sleep_logged'
  | 'asleep'
  | 'bedtime_next'
  | 'too_young'
  | 'night_sleep'
  | 'not_asleep';
export type Slot = { window: PredictWindow; reason: null } | { window: null; reason: NullReason };

/** Feeds logged 22:00–06:00 over the last 7 nights, by who logged them. Null partner: not paired yet. */
export type NightFeeds = { nights: number; you: number; partner: number | null };

export type Prediction = {
  ageWeeks: number;
  feed: Slot;
  nap: Slot;
  routine: Slot;
  bedtime: Slot;
  wake: Slot;
  nightFeeds: NightFeeds | null;
};

export type PredictError = 'rate_limited' | 'not_in_family' | 'multiple_babies' | 'unknown';
export type PredictResult = { ok: true; prediction: Prediction } | { ok: false; error: PredictError };

const KNOWN: readonly PredictError[] = ['rate_limited', 'not_in_family', 'multiple_babies'];
const BASES = new Set<string>(['age', 'personal', 'blend']);
const REASONS = new Set<string>([
  'no_feed_logged',
  'no_sleep_logged',
  'asleep',
  'bedtime_next',
  'too_young',
  'night_sleep',
  'not_asleep',
]);

function parseSlot(value: unknown): Slot | null {
  if (!value || typeof value !== 'object') return null;
  const slot = value as { window?: unknown; reason?: unknown };
  if (slot.window === null) {
    return typeof slot.reason === 'string' && REASONS.has(slot.reason)
      ? { window: null, reason: slot.reason as NullReason }
      : null;
  }
  const w = slot.window as Record<string, unknown> | undefined;
  if (
    !w ||
    typeof w.start !== 'string' ||
    typeof w.end !== 'string' ||
    Number.isNaN(Date.parse(w.start)) ||
    Number.isNaN(Date.parse(w.end)) ||
    typeof w.basis !== 'string' ||
    !BASES.has(w.basis) ||
    typeof w.samples !== 'number'
  ) {
    return null;
  }
  return {
    window: { start: w.start, end: w.end, basis: w.basis as Basis, samples: w.samples },
    reason: null,
  };
}

function parseNightFeeds(value: unknown): NightFeeds | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const count = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  if (!count(v.nights) || !count(v.you) || !(v.partner === null || count(v.partner))) return null;
  return { nights: v.nights as number, you: v.you as number, partner: v.partner as number | null };
}

function parsePrediction(data: unknown): Prediction | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  const feed = parseSlot(body.feed);
  const nap = parseSlot(body.nap);
  const routine = parseSlot(body.routine);
  const bedtime = parseSlot(body.bedtime);
  const wake = parseSlot(body.wake);
  if (!feed || !nap || !routine || !bedtime || !wake || typeof body.age_weeks !== 'number') return null;
  return { ageWeeks: body.age_weeks, feed, nap, routine, bedtime, wake, nightFeeds: parseNightFeeds(body.night_feeds) };
}

export async function fetchPrediction(): Promise<PredictResult> {
  const tz = timeZoneName();
  const { data, error } = await supabase.functions.invoke<unknown>('predict', {
    body: { tz_offset_minutes: tzOffsetMinutes(), ...(tz ? { tz } : {}) },
  });
  if (!error) {
    const prediction = parsePrediction(data);
    return prediction ? { ok: true, prediction } : { ok: false, error: 'unknown' };
  }
  if (error instanceof FunctionsHttpError) {
    try {
      const payload: unknown = await error.context.json();
      if (payload && typeof payload === 'object' && 'error' in payload) {
        const code = (payload as { error: unknown }).error;
        const match = KNOWN.find((known) => known === code);
        if (match) return { ok: false, error: match };
      }
    } catch {
      // Fall through to unknown.
    }
  }
  return { ok: false, error: 'unknown' };
}
