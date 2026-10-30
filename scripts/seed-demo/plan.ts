// The demo family's timeline: three weeks of feeds, sleeps and diapers for a
// 13-week-old in one time zone (Europe/Bucharest unless --tz), ending just
// before the recording time (the anchor). Pure and deterministic: the same
// anchor and zone always give the same rows. No I/O; seed.ts writes the plan.
//
// The last nap (or, early in the day, the morning wake) is placed so that, at
// the anchor, the real prediction engine opens the nap window 15-45 min later
// and tonight's bedtime routine is still ahead. Bedtime is a clock time for
// this age (routine 18:30-20:00 local) and naps only start in the day, so this
// works from the morning to the early evening, not at night; validAnchorRange()
// finds that part with the engine. For a night-time take, seed in a zone where
// it is day (--tz) and set the phones to it.

import { predict, type PredictEvent, type Prediction } from "../../supabase/functions/_shared/predict.ts";
import { HISTORY_DAYS } from "../../supabase/functions/_shared/predict-constants.ts";
import {
  localParts,
  localToUtc,
  MS_PER_DAY,
  MS_PER_MINUTE,
  type Zone,
} from "../../supabase/functions/_shared/zone.ts";

/** The default zone; --tz picks another. */
export const ZONE: Zone = { kind: "iana", name: "Europe/Bucharest" };
/** Days of history before the anchor's day. */
export const HISTORY = 21;
/** 13 weeks and 2 days old on the anchor's day. */
export const AGE_DAYS = 13 * 7 + 2;
/** --at may be at most this far after the run time. */
export const MAX_AHEAD_MIN = 30;
/** Minutes from the anchor to the nap window's start. */
export const NAP_LEAD = { min: 15, max: 45, target: 30 } as const;
/**
 * Today's morning wake may move this far (min) from the usual 06:35-06:55 (so 05:50-08:25),
 * so a nap window fits any day-time take. Tried in this order; the first that fits wins.
 */
export const TODAY_WAKE_SHIFTS = [0, -15, 15, -30, 30, -45, 45, 60, 75, 90] as const;
/** No event starts or ends later than this before the anchor (so never after the run time). */
export const QUIET_BEFORE_ANCHOR_MIN = MAX_AHEAD_MIN;

export type Parent = "parent1" | "parent2";
export type EventDetails =
  | { kind: "bottle"; ml: number }
  | { kind: "breast"; side: "left" | "right"; minutes: number }
  | { wet: boolean; dirty: boolean }
  | Record<string, never>;
export type PlannedEvent = {
  type: "feed" | "sleep" | "diaper";
  started_at: string;
  ended_at: string | null;
  details: EventDetails;
  by: Parent;
  source: "tap" | "chat" | "voice";
};
export type PlannedCheckin = { day: string; by: Parent; mood: number; help: string };
export type Plan = {
  anchor: Date;
  birthDate: string;
  events: PlannedEvent[];
  checkins: PlannedCheckin[];
  prediction: Prediction;
};

const SEED = 20261104;
/** One mother-heavy pattern for night feeds: 3 of every 5 (60/40). */
const NIGHT_PATTERN: readonly Parent[] = ["parent1", "parent2", "parent1", "parent1", "parent2"];
const HELP = [
  "A coffee I don't have to reheat",
  "Taking the first night feed",
  "Twenty minutes outside on my own",
  "You doing the bath tonight",
  "An early night",
  "A walk together after her nap",
] as const;

// ---- Randomness: one stream per day (counted back from the anchor's day) and purpose.

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;
const rng = (daysBack: number, salt: number): Rng =>
  mulberry32(SEED ^ Math.imul(daysBack + 1, 7919) ^ Math.imul(salt, 104729));
const between = (r: Rng, min: number, max: number) => min + Math.floor(r() * (max - min + 1));

/** Morning wake on the day `daysBack` before the anchor's day, local minutes (about 06:45). */
const wakeMinute = (daysBack: number) => between(rng(daysBack, 1), 395, 415);
/** Night-sleep start that evening (about 19:45). */
const bedMinute = (daysBack: number) => between(rng(daysBack, 2), 1170, 1200);

// ---- Building rows

type Row = Omit<PlannedEvent, "started_at" | "ended_at"> & { start: number; end: number | null };

class Day {
  readonly rows: Row[] = [];
  /** Today only: the last local minute a diaper change may be logged (the quiet gap before the anchor). */
  until = Infinity;
  constructor(readonly zone: Zone, readonly day: number, readonly r: Rng) {}

  at(minute: number, day = this.day): number {
    return localToUtc(this.zone, day, minute);
  }

  source(): PlannedEvent["source"] {
    const x = this.r();
    return x < 0.08 ? "chat" : x < 0.12 ? "voice" : "tap";
  }

  feed(minute: number, by: Parent, day = this.day): void {
    const details: EventDetails = by === "parent1" && this.r() < 0.35
      ? { kind: "breast", side: this.r() < 0.5 ? "left" : "right", minutes: between(this.r, 10, 20) }
      : { kind: "bottle", ml: 5 * between(this.r, 18, 30) };
    this.rows.push({
      type: "feed",
      start: this.at(minute, day),
      end: null,
      details,
      by,
      source: this.source(),
    });
  }

  sleep(from: number, to: number, toDay = this.day): void {
    const by: Parent = this.r() < 0.6 ? "parent1" : "parent2";
    this.rows.push({
      type: "sleep",
      start: this.at(from),
      end: this.at(to, toDay),
      details: {},
      by,
      source: this.source(),
    });
  }

  diaper(minute: number, day = this.day): void {
    const dirty = this.r() < 0.35;
    const wet = !dirty || this.r() < 0.6;
    const by: Parent = this.r() < 0.6 ? "parent1" : "parent2";
    this.rows.push({
      type: "diaper",
      start: this.at(minute, day),
      end: null,
      details: { wet, dirty },
      by,
      source: this.source(),
    });
  }

  /** A day feed, often followed by a diaper change; one due during a nap waits until she wakes. */
  feedAndChange(planned: number): void {
    const ms = this.at(planned);
    const nap = this.rows.find((r) => r.type === "sleep" && r.end !== null && ms >= r.start && ms < r.end);
    const minute = nap?.end ? planned + Math.round((nap.end - ms) / MS_PER_MINUTE) + 5 : planned;
    this.feed(minute, this.r() < 0.65 ? "parent1" : "parent2");
    if (this.r() < 0.85) {
      const change = minute + between(this.r, 5, 20);
      if (change <= this.until) this.diaper(change);
    }
  }
}

/** A full past day: four naps (the last a catnap) and feeds every 2.5-3.5 h until bedtime. */
function pastDay(zone: Zone, anchorDay: number, daysBack: number): Row[] {
  const d = new Day(zone, anchorDay - daysBack, rng(daysBack, 3));
  const wake = wakeMinute(daysBack);
  const bed = bedMinute(daysBack);
  let t = wake;
  for (let i = 0; i < 4; i++) {
    const start = t + between(d.r, 95, 115);
    const end = start + (i === 3 ? between(d.r, 35, 45) : between(d.r, 65, 100));
    d.sleep(start, end);
    t = end;
  }
  for (let f = wake + between(d.r, 5, 15); f <= bed - 15; f += between(d.r, 150, 210)) d.feedAndChange(f);
  return d.rows;
}

/**
 * The night starting on the evening `daysBack` days before the anchor's day: one
 * sleep until `wake` the next morning, two feeds.
 */
function night(zone: Zone, anchorDay: number, daysBack: number, wake = wakeMinute(daysBack - 1)): Row[] {
  const evening = anchorDay - daysBack;
  const d = new Day(zone, evening, rng(daysBack, 4));
  d.sleep(bedMinute(daysBack), wake, evening + 1);
  const feeds: [number, number][] = [[between(d.r, 1365, 1395), evening], [
    between(d.r, 195, 225),
    evening + 1,
  ]];
  feeds.forEach(([minute, day], j) => {
    const by = NIGHT_PATTERN[((daysBack - 1) * 2 + j) % NIGHT_PATTERN.length];
    d.feed(minute, by, day);
    if (d.r() < 0.5) d.diaper(minute + between(d.r, 5, 15), day);
  });
  return d.rows;
}

/**
 * The anchor's day from the morning wake (`wake`, local minutes) up to the last
 * nap, which ends at `lastNapEnd`, or with no nap yet when `lastNapEnd` is null
 * (an early-morning take). Wake windows and naps are spread evenly between the
 * wake and that nap; null when they would fall outside 85-125 min awake or
 * 45-110 min asleep.
 */
function today(
  zone: Zone,
  anchorDay: number,
  anchorMinute: number,
  wake: number,
  lastNapEnd: number | null,
): Row[] | null {
  const d = new Day(zone, anchorDay, rng(0, 3));
  d.until = anchorMinute - QUIET_BEFORE_ANCHOR_MIN;
  if (lastNapEnd !== null) {
    const lastStart = lastNapEnd - between(d.r, 60, 85);
    const WAKE = 105;
    const NAP = 80;
    const cycles = Math.max(0, Math.round((lastStart - wake - WAKE) / (WAKE + NAP)));
    const shift = (lastStart - wake - WAKE - cycles * (WAKE + NAP)) / (2 * cycles + 1);
    const awake = WAKE + shift;
    const asleep = NAP + shift;
    if (awake < 85 || awake > 125 || (cycles > 0 && (asleep < 45 || asleep > 110))) return null;
    let t = wake;
    for (let i = 0; i < cycles; i++) {
      const start = Math.round(t + awake);
      const end = Math.round(start + asleep);
      d.sleep(start, end);
      t = end;
    }
    d.sleep(lastStart, lastNapEnd);
  }

  // Feeds from the morning to about 90 min before the anchor, evenly spaced;
  // early in the day, only the wake-up feed.
  const first = wake + between(d.r, 5, 15);
  const last = anchorMinute - between(d.r, 80, 100);
  if (last < first) {
    d.feedAndChange(first);
  } else {
    const n = Math.max(1, Math.round((last - first) / 180));
    for (let i = 0; i <= n; i++) {
      const jitter = i === 0 || i === n ? 0 : between(d.r, -10, 10);
      d.feedAndChange(Math.round(first + ((last - first) * i) / n) + jitter);
    }
  }
  return d.rows;
}

function checkins(anchorDay: number): PlannedCheckin[] {
  const out: PlannedCheckin[] = [];
  for (let daysBack = 3; daysBack >= 1; daysBack--) {
    const r = rng(daysBack, 5);
    for (const by of ["parent1", "parent2"] as const) {
      out.push({
        day: isoDay(anchorDay - daysBack),
        by,
        mood: between(r, 2, 5),
        help: HELP[between(r, 0, HELP.length - 1)],
      });
    }
  }
  return out;
}

// ---- The plan

const isoDay = (day: number) => new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
const iso = (ms: number) => new Date(ms).toISOString();

const historyCache = new Map<string, Row[]>();

/**
 * Everything before last night: independent of the anchor's time, so built
 * once per day and zone. Last night ends at today's wake, which buildPlan picks.
 */
function history(zone: Zone, anchorDay: number): Row[] {
  const key = `${JSON.stringify(zone)}@${anchorDay}`;
  let rows = historyCache.get(key);
  if (!rows) {
    rows = [];
    for (let daysBack = HISTORY; daysBack >= 1; daysBack--) {
      if (daysBack < HISTORY) rows.push(...pastDay(zone, anchorDay, daysBack));
      if (daysBack > 1) rows.push(...night(zone, anchorDay, daysBack));
    }
    historyCache.set(key, rows);
  }
  return rows;
}

function toEvent(row: Row): PlannedEvent {
  const { start, end, ...rest } = row;
  return { ...rest, started_at: iso(start), ended_at: end === null ? null : iso(end) };
}

/** What the "Next up" card shows at `anchor` for these rows. */
export function predictAt(
  anchor: Date,
  birthDate: string,
  events: readonly PlannedEvent[],
  zone: Zone = ZONE,
): Prediction {
  const since = anchor.getTime() - HISTORY_DAYS * MS_PER_DAY;
  const recent: PredictEvent[] = events
    .filter((e) => Date.parse(e.started_at) >= since && Date.parse(e.started_at) <= anchor.getTime())
    .map(({ type, started_at, ended_at }) => ({ type, started_at, ended_at }));
  return predict({ now: anchor, zone, birthDate, events: recent });
}

export type Leads = { nap: number | null; routine: number | null; feedOverdue: boolean };

/** Minutes from the anchor to the nap window and the routine; whether the feed window has passed. */
export function leads(anchor: Date, prediction: Prediction): Leads {
  const minutesFrom = (iso: string) => (Date.parse(iso) - anchor.getTime()) / MS_PER_MINUTE;
  return {
    nap: prediction.nap.window ? minutesFrom(prediction.nap.window.start) : null,
    routine: prediction.routine.window ? minutesFrom(prediction.routine.window.start) : null,
    feedOverdue: prediction.feed.window === null ||
      Date.parse(prediction.feed.window.end) <= anchor.getTime(),
  };
}

/** The nap window opens 15-45 min after the anchor, tonight's routine hasn't started, the feed isn't overdue. */
export function leadsFit(l: Leads): boolean {
  return l.nap !== null && l.nap >= NAP_LEAD.min && l.nap <= NAP_LEAD.max &&
    l.routine !== null && l.routine >= 0 && !l.feedOverdue;
}

/**
 * The demo timeline for a recording at `anchor` (whole minutes) in `zone`, or
 * null when no morning wake and placement of the last nap (or no nap yet)
 * makes the card show the nap window soon and the routine still ahead at that
 * time of day. Prefers the usual wake time, then the nap window 30 min out.
 */
export function buildPlan(anchor: Date, zone: Zone = ZONE): Plan | null {
  const { day: anchorDay, minute: anchorMinute } = localParts(zone, anchor.getTime());
  const birthDate = isoDay(anchorDay - AGE_DAYS);
  const past = history(zone, anchorDay);
  const latest = anchor.getTime() - QUIET_BEFORE_ANCHOR_MIN * MS_PER_MINUTE;
  const lastNapEnds: (number | null)[] = [null];
  for (let end = anchorMinute - 150; end <= anchorMinute - QUIET_BEFORE_ANCHOR_MIN; end += 5) {
    lastNapEnds.push(end);
  }
  for (const wakeShift of TODAY_WAKE_SHIFTS) {
    let best: { plan: Plan; distance: number } | null = null;
    const wake = wakeMinute(0) + wakeShift;
    const lastNight = night(zone, anchorDay, 1, wake);
    for (const end of lastNapEnds) {
      const rows = today(zone, anchorDay, anchorMinute, wake, end);
      if (!rows) continue;
      const all = [...past, ...lastNight, ...rows];
      if (all.some((r) => r.start > latest || (r.end !== null && r.end > latest))) continue;
      const events = all.sort((a, b) => a.start - b.start).map(toEvent);
      const prediction = predictAt(anchor, birthDate, events, zone);
      const l = leads(anchor, prediction);
      if (!leadsFit(l)) continue;
      const distance = Math.abs((l.nap ?? 0) - NAP_LEAD.target);
      if (!best || distance < best.distance) {
        best = { plan: { anchor, birthDate, events, checkins: checkins(anchorDay), prediction }, distance };
      }
    }
    if (best) return best.plan;
  }
  return null;
}

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/**
 * The local times on `now`'s day (5-min steps) at which buildPlan succeeds: the
 * longest contiguous run, as "HH:MM". Computed with the prediction engine.
 */
export function validAnchorRange(now: Date, zone: Zone = ZONE): { from: string; to: string } | null {
  const day = localParts(zone, now.getTime()).day;
  let run: [number, number] | null = null;
  let longest: [number, number] | null = null;
  for (let minute = 0; minute < 24 * 60; minute += 5) {
    if (buildPlan(new Date(localToUtc(zone, day, minute)), zone)) {
      run = run ? [run[0], minute] : [minute, minute];
      if (!longest || run[1] - run[0] > longest[1] - longest[0]) longest = run;
    } else {
      run = null;
    }
  }
  return longest ? { from: hhmm(longest[0]), to: hhmm(longest[1]) } : null;
}

export type AnchorResult =
  | { ok: true; anchor: Date }
  | { ok: false; reason: "bad_format" | "before_run" | "too_far_ahead" };

/**
 * The recording time: today's HH:MM in `zone`, or the run time. Compared at
 * whole minutes, so --at 17:00 run at 17:00:40 is the run's own minute.
 */
export function resolveAnchor(now: Date, at: string | undefined, zone: Zone = ZONE): AnchorResult {
  const runMinute = Math.floor(now.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
  if (at === undefined) return { ok: true, anchor: new Date(runMinute) };
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(at);
  if (!match) return { ok: false, reason: "bad_format" };
  const day = localParts(zone, now.getTime()).day;
  const anchor = localToUtc(zone, day, Number(match[1]) * 60 + Number(match[2]));
  if (anchor < runMinute) return { ok: false, reason: "before_run" };
  if (anchor - runMinute > MAX_AHEAD_MIN * MS_PER_MINUTE) return { ok: false, reason: "too_far_ahead" };
  return { ok: true, anchor: new Date(anchor) };
}

/** Local "HH:MM" of an instant, for messages. */
export function localTime(ms: number, zone: Zone = ZONE): string {
  return hhmm(localParts(zone, ms).minute);
}
