// The prediction engine: next feed, next nap, bedtime-routine start and
// bedtime as time windows. Pure code: the caller passes in now, the zone, the
// birth date and the events; there is no I/O and no AI. The predict function
// and the chat agent both call this, so the card and the chat always agree.
// Results are computed on request, never stored.
//
// Each window comes from an age band (predict-constants.ts), the baby's own
// median over the last 7 days, or a blend of the two, and is always clamped to
// the age band. Durations are measured in real time; local clock times
// (bedtime, daytime) go through the zone, so DST changes are handled.

import {
  bandFor,
  DAY_END,
  DAY_START,
  FEED_CLUSTER_MIN,
  FEED_INTERVAL_MAX,
  HISTORY_DAYS,
  NAP_LENGTH,
  NIGHT_SLEEP_MIN,
  type Range,
  ROUTINE_LEAD_MIN,
  RULES,
  type SampleRule,
  WAKE_WINDOW_MIN,
} from "./predict-constants.ts";
import { dayNumber, localParts, localToUtc, MS_PER_DAY, MS_PER_MINUTE, type Zone } from "./zone.ts";

export type PredictEvent = { type: string; started_at: string; ended_at: string | null };

export type PredictInput = { now: Date; zone: Zone; birthDate: string; events: PredictEvent[] };

export type Basis = "age" | "personal" | "blend";
export type PredictWindow = { start: string; end: string; basis: Basis; samples: number };

export type NullReason =
  | "no_feed_logged"
  | "no_sleep_logged"
  | "asleep"
  | "bedtime_next"
  | "too_young"
  | "night_sleep"
  | "not_asleep";

export type Slot = { window: PredictWindow; reason: null } | { window: null; reason: NullReason };

export type Prediction = {
  age_weeks: number;
  feed: Slot;
  nap: Slot;
  routine: Slot;
  bedtime: Slot;
  /** Expected wake from the sleep in progress; `not_asleep` otherwise. */
  wake: Slot;
};

type Estimate = { lo: number; hi: number; basis: Basis; samples: number };
type Sleep = { start: number; end: number | null };

const empty = (reason: NullReason): Slot => ({ window: null, reason });

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * The window, in minutes from an anchor, for these samples. Personal with
 * enough samples, blended with the band middle below that, the band itself
 * with too few. The centre is clamped to the band and the window cut to it.
 */
export function estimate(samples: readonly number[], band: Range, rule: SampleRule): Estimate {
  const n = samples.length;
  if (n < rule.blendMin) return { lo: band.min, hi: band.max, basis: "age", samples: n };
  const weight = Math.min(1, n / rule.personalMin);
  const mid = (band.min + band.max) / 2;
  const raw = weight * median(samples) + (1 - weight) * mid;
  const center = Math.round(Math.min(band.max, Math.max(band.min, raw)));
  return {
    lo: Math.max(band.min, center - rule.halfWidth),
    hi: Math.min(band.max, center + rule.halfWidth),
    basis: n >= rule.personalMin ? "personal" : "blend",
    samples: n,
  };
}

function windowFrom(anchorMs: number, e: Estimate): PredictWindow {
  return {
    start: new Date(anchorMs + e.lo * MS_PER_MINUTE).toISOString(),
    end: new Date(anchorMs + e.hi * MS_PER_MINUTE).toISOString(),
    basis: e.basis,
    samples: e.samples,
  };
}

export function ageInWeeksAt(birthDate: string, now: Date, zone: Zone): number {
  const days = localParts(zone, now.getTime()).day - dayNumber(birthDate);
  return Math.max(0, Math.floor(days / 7));
}

export function predict(input: PredictInput): Prediction {
  const { zone } = input;
  const now = input.now.getTime();
  const since = now - HISTORY_DAYS * MS_PER_DAY;
  const ageWeeks = ageInWeeksAt(input.birthDate, input.now, zone);
  const band = bandFor(ageWeeks);
  const local = (ms: number) => localParts(zone, ms);
  const isDaytime = (ms: number) => {
    const minute = local(ms).minute;
    return minute >= DAY_START && minute < DAY_END;
  };

  const feeds: number[] = [];
  const sleeps: Sleep[] = [];
  for (const event of input.events) {
    const start = Date.parse(event.started_at);
    if (!Number.isFinite(start) || start > now) continue;
    const end = event.ended_at === null ? null : Date.parse(event.ended_at);
    if (event.type === "feed" && start >= since) feeds.push(start);
    if (event.type === "sleep") {
      if (end === null) sleeps.push({ start, end: null });
      else if (Number.isFinite(end) && end >= start && end <= now && start >= since) {
        sleeps.push({ start, end });
      }
    }
  }
  feeds.sort((a, b) => a - b);
  sleeps.sort((a, b) => a.start - b.start);
  const done = sleeps.filter((s): s is { start: number; end: number } => s.end !== null);
  // At most one sleep is open per baby (unique index); take the latest if not.
  const open = sleeps.filter((s) => s.end === null).at(-1) ?? null;

  // ---- Feed: from the start of the last feed cluster ------------------------
  const clusters: number[] = [];
  for (const start of feeds) {
    const first = clusters.at(-1);
    if (first === undefined || start - first >= FEED_CLUSTER_MIN * MS_PER_MINUTE) clusters.push(start);
  }
  const feedIntervals: number[] = [];
  for (let i = 1; i < clusters.length; i++) {
    const minutes = (clusters[i] - clusters[i - 1]) / MS_PER_MINUTE;
    if (minutes <= FEED_INTERVAL_MAX) feedIntervals.push(minutes);
  }
  const lastFeed = clusters.at(-1);
  const feed: Slot = lastFeed === undefined
    ? empty("no_feed_logged")
    : { window: windowFrom(lastFeed, estimate(feedIntervals, band.feed, RULES.feed)), reason: null };

  // ---- Bedtime and routine --------------------------------------------------
  const bedtimeEstimate = band.bedtime
    ? estimate(nightStarts(done, local), band.bedtime, RULES.bedtime)
    : null;
  let bedtime: Slot = empty("too_young");
  let routine: Slot = empty("too_young");
  if (bedtimeEstimate) {
    const today = local(now).day;
    const startedTonight = sleeps.some((s) => {
      const at = local(s.start);
      const longEnough = s.end === null || s.end - s.start >= NIGHT_SLEEP_MIN * MS_PER_MINUTE;
      return at.day === today && at.minute >= DAY_END && longEnough;
    });
    const pastToday = now > localToUtc(zone, today, bedtimeEstimate.hi);
    const day = startedTonight || pastToday ? today + 1 : today;
    const start = localToUtc(zone, day, bedtimeEstimate.lo);
    const end = localToUtc(zone, day, bedtimeEstimate.hi);
    const meta = { basis: bedtimeEstimate.basis, samples: bedtimeEstimate.samples };
    bedtime = { window: { start: iso(start), end: iso(end), ...meta }, reason: null };
    const lead = ROUTINE_LEAD_MIN * MS_PER_MINUTE;
    routine = { window: { start: iso(start - lead), end: iso(end - lead), ...meta }, reason: null };
  }

  // ---- Nap, or the expected wake while asleep -------------------------------
  let nap: Slot;
  let wake: Slot = empty("not_asleep");
  if (open) {
    nap = empty("asleep");
    wake = isDaytime(open.start)
      ? {
        window: windowFrom(open.start, estimate(napLengths(done, isDaytime), band.nap, RULES.nap)),
        reason: null,
      }
      : empty("night_sleep");
  } else if (done.length === 0) {
    nap = empty("no_sleep_logged");
  } else {
    const lastEnd = Math.max(...done.map((s) => s.end));
    const window = windowFrom(lastEnd, estimate(wakeWindows(done, isDaytime), band.wake, RULES.wake));
    nap = { window, reason: null };
    if (bedtimeEstimate) {
      // A nap that would start at bedtime or in the night is the night sleep.
      const napStart = local(Date.parse(window.start)).minute;
      if (napStart >= bedtimeEstimate.lo || napStart < DAY_START) nap = empty("bedtime_next");
    }
  }

  return { age_weeks: ageWeeks, feed, nap, routine, bedtime, wake };
}

/** Sleep end to next sleep start, when the wake begins in the daytime. */
function wakeWindows(
  done: readonly { start: number; end: number }[],
  isDaytime: (ms: number) => boolean,
): number[] {
  const out: number[] = [];
  for (let i = 1; i < done.length; i++) {
    const minutes = (done[i].start - done[i - 1].end) / MS_PER_MINUTE;
    if (minutes >= WAKE_WINDOW_MIN && isDaytime(done[i - 1].end)) out.push(minutes);
  }
  return out;
}

/** Lengths of finished daytime sleeps. */
function napLengths(
  done: readonly { start: number; end: number }[],
  isDaytime: (ms: number) => boolean,
): number[] {
  return done
    .filter((s) => isDaytime(s.start))
    .map((s) => (s.end - s.start) / MS_PER_MINUTE)
    .filter((minutes) => minutes >= NAP_LENGTH.min && minutes <= NAP_LENGTH.max);
}

/** Local start minute of the first long sleep per evening (18:00–23:59). */
function nightStarts(
  done: readonly { start: number; end: number }[],
  local: (ms: number) => { day: number; minute: number },
): number[] {
  const byDay = new Map<number, number>();
  for (const s of done) {
    const at = local(s.start);
    if (at.minute < DAY_END || s.end - s.start < NIGHT_SLEEP_MIN * MS_PER_MINUTE) continue;
    if (!byDay.has(at.day)) byDay.set(at.day, at.minute);
  }
  return [...byDay.values()];
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
