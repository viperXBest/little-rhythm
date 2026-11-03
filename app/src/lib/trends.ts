/**
 * Daily totals for the Trends screen, computed on the phone from the events table: feeds, bottle ml,
 * sleep time and diapers per local calendar day. Counts and totals only; nothing is compared or judged.
 * Pure (no imports), so it runs under Deno. The caller maps rows to `TrendEvent`s
 * (`parseFeed`/`parseDiaper` live in events.ts, which needs the app runtime).
 *
 * Days are built from calendar dates (year, month, day - n), never by adding 24 h, so a day with a
 * clock change is 23 or 25 hours long and every instant still lands in exactly one day. The one place
 * that knows about time zones is the `Calendar`; it defaults to the phone's local one, and tests pass
 * a fixed zone.
 */

export type TrendRange = 7 | 14;
/** The longest view; the screen fetches this once and computes the 7-day view from it. */
export const TREND_MAX_RANGE: TrendRange = 14;

/** A bottle feed's ml, or a breast feed; null when the row's details are not a valid feed. */
export type TrendFeed = { kind: 'bottle'; ml: number } | { kind: 'breast' };

/** One event row, with feed and diaper details already parsed. */
export type TrendEvent = {
  type: string;
  startedAt: string;
  endedAt: string | null;
  feed: TrendFeed | null;
  diaper: { wet: boolean; dirty: boolean } | null;
};

export type TrendDay = {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Local midnight that starts the day, and the one that ends it (ms since the epoch). */
  startMs: number;
  endMs: number;
  /** True for today, whose totals are partial. */
  isToday: boolean;
  feeds: number;
  /** Bottle ml only; breast feeds have no ml. */
  bottleMl: number;
  /** Time asleep inside this day, in ms. */
  sleepMs: number;
  /** Diapers logged; a "both" diaper is in `wet` and in `dirty` too. */
  diapers: number;
  wet: number;
  dirty: number;
};

/** Where calendar days start. `day` may be out of range for the month (0, -3, 32): it rolls over. */
export type Calendar = {
  /** The calendar date of an instant: month 0-11. */
  dateOf: (ms: number) => { year: number; month: number; day: number };
  /** The instant a calendar day starts. */
  startOf: (year: number, month: number, day: number) => number;
};

/** The phone's local calendar. */
export const localCalendar: Calendar = {
  dateOf: (ms) => {
    const date = new Date(ms);
    return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
  },
  startOf: (year, month, day) => new Date(year, month, day).getTime(),
};

const HOUR_MS = 60 * 60 * 1000;

const NBSP = '\u00A0';

/** YYYY-MM-DD of a calendar date; out-of-range days roll over. */
function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** The last `range` local days, oldest first, ending with today, all totals zero. */
function emptyDays(range: number, now: Date, calendar: Calendar): TrendDay[] {
  const today = calendar.dateOf(now.getTime());
  const days: TrendDay[] = [];
  for (let back = range - 1; back >= 0; back--) {
    const day = today.day - back;
    days.push({
      date: isoDate(today.year, today.month, day),
      startMs: calendar.startOf(today.year, today.month, day),
      endMs: calendar.startOf(today.year, today.month, day + 1),
      isToday: back === 0,
      feeds: 0,
      bottleMl: 0,
      sleepMs: 0,
      diapers: 0,
      wet: 0,
      dirty: 0,
    });
  }
  return days;
}

/**
 * The start of the first of the last `range` days: events that start, or sleeps that end, at or after
 * it are the ones to fetch (plus any open sleep).
 */
export function trendsFromMs(range: number, now: Date, calendar: Calendar = localCalendar): number {
  return emptyDays(range, now, calendar)[0].startMs;
}

/**
 * Per-day totals for the last `range` local days including today, oldest first.
 * - Feeds, bottle ml and diapers count on the day the event starts.
 * - A sleep is split at each midnight and counts the time inside each day; an open sleep runs up to `now`,
 *   and no sleep runs past it. Overlapping sleeps (the same nap logged twice) count once, as their union.
 * - A feed whose details are not valid still counts as a feed (with no ml); a diaper whose details are
 *   not valid counts as a diaper that is neither wet nor dirty.
 * - Events outside the days, and other event types, are ignored.
 */
export function buildTrends(
  events: readonly TrendEvent[],
  range: number,
  now: Date,
  calendar: Calendar = localCalendar,
): TrendDay[] {
  const days = emptyDays(range, now, calendar);
  const nowMs = now.getTime();
  const sleeps: [start: number, end: number][] = [];
  for (const event of events) {
    const start = Date.parse(event.startedAt);
    if (!Number.isFinite(start)) continue;
    if (event.type === 'sleep') {
      const end = Math.min(event.endedAt === null ? nowMs : Date.parse(event.endedAt), nowMs);
      if (end > start) sleeps.push([start, end]);
      continue;
    }
    const day = days.find((d) => start >= d.startMs && start < d.endMs);
    if (!day) continue;
    if (event.type === 'feed') {
      day.feeds += 1;
      if (event.feed?.kind === 'bottle') day.bottleMl += event.feed.ml;
    } else if (event.type === 'diaper') {
      day.diapers += 1;
      if (event.diaper?.wet) day.wet += 1;
      if (event.diaper?.dirty) day.dirty += 1;
    }
  }
  for (const [start, end] of mergeIntervals(sleeps)) {
    for (const day of days) {
      const overlap = Math.min(end, day.endMs) - Math.max(start, day.startMs);
      if (overlap > 0) day.sleepMs += overlap;
    }
  }
  return days;
}

/** The union of the intervals: sorted by start, with overlapping or touching ones joined. */
function mergeIntervals(intervals: readonly [start: number, end: number][]): [number, number][] {
  const merged: [number, number][] = [];
  for (const [start, end] of [...intervals].sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** True when the day has a feed, a diaper or some sleep. */
export function dayHasData(day: TrendDay): boolean {
  return day.feeds > 0 || day.diapers > 0 || day.sleepMs > 0;
}

/** True when any of the days has something logged. */
export function hasTrendData(days: readonly TrendDay[]): boolean {
  return days.some(dayHasData);
}

/** Time asleep as "13 h 20 min" (rounded to the minute), or "45 min" under an hour. */
export function formatSleep(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}${NBSP}h ${minutes % 60}${NBSP}min` : `${minutes}${NBSP}min`;
}

/** A number and its unit joined by a non-breaking space, e.g. "640 ml". */
export function unitLabel(value: number, unit: string): string {
  return `${value}${NBSP}${unit}`;
}

/** "1 feed", "12 feeds". */
export function countLabel(count: number, noun: string): string {
  return `${count}${NBSP}${noun}${count === 1 ? '' : 's'}`;
}

export const feedsText = (day: TrendDay): string => countLabel(day.feeds, 'feed');
export const bottleText = (day: TrendDay): string => unitLabel(day.bottleMl, 'ml');
export const sleepText = (day: TrendDay): string => formatSleep(day.sleepMs);
export const diapersText = (day: TrendDay): string =>
  `${countLabel(day.diapers, 'diaper')}, ${day.wet}${NBSP}wet, ${day.dirty}${NBSP}dirty`;

/** Hours asleep, for the chart. */
export function sleepHours(ms: number): number {
  return ms / HOUR_MS;
}

const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/** Smallest round number (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 times a power of ten) at or above `value`. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const step = NICE_STEPS.find((s) => s >= scaled - 1e-9) ?? 10;
  return Number((step * magnitude).toPrecision(12));
}
