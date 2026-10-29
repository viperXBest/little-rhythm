import { assertEquals } from "jsr:@std/assert@1.0.13";

import { BUCHAREST, dailyEvents, feedAt, sleepAt, THREE_MONTH_SCHEDULE } from "./predict.fixtures.ts";
import { estimate, median, predict, type PredictWindow, type Slot } from "./predict.ts";
import { RULES } from "./predict-constants.ts";
import {
  dayNumber,
  localParts,
  localToUtc,
  offsetAt,
  parseZone,
  toZoneLocalTime,
  type Zone,
} from "./zone.ts";

// Bucharest is UTC+3 until 04:00 local on Sun 25 Oct 2026, UTC+2 after.
const OFFSET_PLUS_2: Zone = { kind: "offset", minutes: 120 };

function win(slot: Slot): PredictWindow | null {
  return slot.window;
}

function range(slot: Slot) {
  const w = slot.window;
  return w ? { start: w.start, end: w.end, basis: w.basis, samples: w.samples } : { reason: slot.reason };
}

// ---------------------------------------------------------------------------
// Zone helpers
// ---------------------------------------------------------------------------

Deno.test("zone: Bucharest offset on both sides of the 25 Oct DST change", () => {
  assertEquals(offsetAt(BUCHAREST, Date.parse("2026-10-24T12:00:00Z")), 180);
  assertEquals(offsetAt(BUCHAREST, Date.parse("2026-10-26T12:00:00Z")), 120);
  const oct25 = dayNumber("2026-10-25");
  // 02:00 is still summer time (UTC+3); 05:00 is winter time (UTC+2).
  assertEquals(new Date(localToUtc(BUCHAREST, oct25, 2 * 60)).toISOString(), "2026-10-24T23:00:00.000Z");
  assertEquals(new Date(localToUtc(BUCHAREST, oct25, 5 * 60)).toISOString(), "2026-10-25T03:00:00.000Z");
  // Three wall-clock hours, four real ones.
  assertEquals(localParts(BUCHAREST, Date.parse("2026-10-25T03:00:00Z")), { day: oct25, minute: 300 });
  assertEquals(toZoneLocalTime("2026-10-24T17:00:00Z", BUCHAREST), "2026-10-24T20:00");
  assertEquals(toZoneLocalTime("2026-10-26T18:00:00Z", BUCHAREST), "2026-10-26T20:00");
});

Deno.test("zone: IANA name when valid, offset as fallback, else null", () => {
  assertEquals(parseZone("Europe/Bucharest", 120), { kind: "iana", name: "Europe/Bucharest" });
  assertEquals(parseZone("Mars/Olympus_Mons", 120), { kind: "offset", minutes: 120 });
  assertEquals(parseZone(undefined, -300), { kind: "offset", minutes: -300 });
  assertEquals(parseZone("Not/AZone", undefined), null);
  assertEquals(parseZone(undefined, 10_000), null);
  assertEquals(parseZone("x".repeat(65), undefined), null);
});

// ---------------------------------------------------------------------------
// Estimate
// ---------------------------------------------------------------------------

Deno.test("estimate: age below blendMin, blend in between, personal at personalMin", () => {
  const band = { min: 150, max: 240 };
  assertEquals(median([3, 1, 2]), 2);
  assertEquals(median([1, 2, 3, 10]), 2.5);
  // 3 samples < 4: the band itself.
  assertEquals(estimate([180, 180, 180], band, RULES.feed), { lo: 150, hi: 240, basis: "age", samples: 3 });
  // 6 samples: w = 6/12; 0.5 × 180 + 0.5 × 195 = 187.5 -> 188; ±20.
  assertEquals(estimate(Array(6).fill(180), band, RULES.feed), {
    lo: 168,
    hi: 208,
    basis: "blend",
    samples: 6,
  });
  // 12 samples: the median, ±20.
  assertEquals(estimate(Array(12).fill(180), band, RULES.feed), {
    lo: 160,
    hi: 200,
    basis: "personal",
    samples: 12,
  });
});

// ---------------------------------------------------------------------------
// Fixtures. Expected windows are worked out by hand in the comments.
// ---------------------------------------------------------------------------

Deno.test("newborn with no history: age band only, no bedtime", () => {
  // Born 8 Oct; now Thu 29 Oct 14:30 local (12:30Z, UTC+2) -> 21 days = 3 weeks,
  // band 0–3 wk: feed 120–180, wake 35–60, no bedtime.
  const now = new Date("2026-10-29T12:30:00Z");
  const result = predict({
    now,
    zone: BUCHAREST,
    birthDate: "2026-10-08",
    events: [
      feedAt("2026-10-29T11:00:00Z"), // 13:00 local
      sleepAt("2026-10-29T11:30:00Z", "2026-10-29T12:00:00Z"), // 13:30–14:00 local
    ],
  });
  assertEquals(result.age_weeks, 3);
  // One feed, no interval: 11:00Z + 120..180 min.
  assertEquals(range(result.feed), {
    start: "2026-10-29T13:00:00.000Z",
    end: "2026-10-29T14:00:00.000Z",
    basis: "age",
    samples: 0,
  });
  // One sleep, no wake window: 12:00Z + 35..60 min.
  assertEquals(range(result.nap), {
    start: "2026-10-29T12:35:00.000Z",
    end: "2026-10-29T13:00:00.000Z",
    basis: "age",
    samples: 0,
  });
  assertEquals(result.bedtime, { window: null, reason: "too_young" });
  assertEquals(result.routine, { window: null, reason: "too_young" });
  assertEquals(result.wake, { window: null, reason: "not_asleep" });
});

Deno.test("regular 3-month-old over 7 days: personal everywhere", () => {
  // Now Thu 29 Oct 14:30 local = 12:30Z. Born 29 Jul -> 92 days = 13 weeks,
  // band 13–16 wk: feed 150–240, wake 90–120, bedtime 19:00–21:00.
  // History starts 22 Oct 12:30Z = 15:30 local (UTC+3 then).
  const now = new Date("2026-10-29T12:30:00Z");
  const events = dailyEvents(THREE_MONTH_SCHEDULE, now, BUCHAREST);
  const result = predict({ now, zone: BUCHAREST, birthDate: THREE_MONTH_SCHEDULE.birthDate, events });
  assertEquals(result.age_weeks, 13);

  // Feeds: 22 Oct 16,19,23 (3) + 23–28 Oct 7 a day (42) + 29 Oct 03,07,10,13 (4)
  // = 49 starts, 48 intervals. 4 of every 7 are 180 min, so the median is 180
  // (the DST night's 300 min interval doesn't move it). Centre 180, ±20:
  // last feed 13:00 local (11:00Z) + 160..200 min = 13:40Z..14:20Z.
  assertEquals(range(result.feed), {
    start: "2026-10-29T13:40:00.000Z",
    end: "2026-10-29T14:20:00.000Z",
    basis: "personal",
    samples: 48,
  });

  // Daytime wake windows: night->nap1 90 (7 of them: 23–29 Oct mornings),
  // nap1->nap2 105 (23–29 Oct: 7), nap2->nap3 105 (23–28: 6), nap3->night 195 (23–28: 6).
  // Sorted: 7×90, 13×105, 6×195, n = 26; positions 13 and 14 are 105.
  // Centre 105, ±15 = 90..120 (= the band). Last sleep end 13:15 local (11:15Z)
  // -> 12:45Z..13:15Z.
  assertEquals(range(result.nap), {
    start: "2026-10-29T12:45:00.000Z",
    end: "2026-10-29T13:15:00.000Z",
    basis: "personal",
    samples: 26,
  });

  // Night starts 22–28 Oct at 19:30 local: 7 samples, median 19:30, ±30 =
  // 19:00..20:00 local tonight (UTC+2) = 17:00Z..18:00Z. Routine 30 min earlier.
  assertEquals(range(result.bedtime), {
    start: "2026-10-29T17:00:00.000Z",
    end: "2026-10-29T18:00:00.000Z",
    basis: "personal",
    samples: 7,
  });
  assertEquals(range(result.routine), {
    start: "2026-10-29T16:30:00.000Z",
    end: "2026-10-29T17:30:00.000Z",
    basis: "personal",
    samples: 7,
  });
  assertEquals(result.wake, { window: null, reason: "not_asleep" });
});

Deno.test("sparse data: blend of personal median and age band", () => {
  // 13-week-old, now Thu 29 Oct 10:00 local = 08:00Z (UTC+2 on both days).
  const now = new Date("2026-10-29T08:00:00Z");
  const events = [
    // Feeds 18:00, 21:00, 00:00, 03:00, 06:00, 09:00 local: 5 intervals of 180.
    feedAt("2026-10-28T16:00:00Z"),
    feedAt("2026-10-28T19:00:00Z"),
    feedAt("2026-10-28T22:00:00Z"),
    feedAt("2026-10-29T01:00:00Z"),
    feedAt("2026-10-29T04:00:00Z"),
    feedAt("2026-10-29T07:00:00Z"),
    // Sleeps 10–11, 13–14, 16–17, night 19:00–06:00, 08–09 local: 4 daytime
    // wake windows of 120 (wakes at 11:00, 14:00, 17:00 and 06:00).
    sleepAt("2026-10-28T08:00:00Z", "2026-10-28T09:00:00Z"),
    sleepAt("2026-10-28T11:00:00Z", "2026-10-28T12:00:00Z"),
    sleepAt("2026-10-28T14:00:00Z", "2026-10-28T15:00:00Z"),
    sleepAt("2026-10-28T17:00:00Z", "2026-10-29T04:00:00Z"),
    sleepAt("2026-10-29T06:00:00Z", "2026-10-29T07:00:00Z"),
  ];
  const result = predict({ now, zone: BUCHAREST, birthDate: "2026-07-29", events });

  // Feed: w = 5/12, band middle 195: 5/12 × 180 + 7/12 × 195 = 188.75 -> 189,
  // ±20 = 169..209 min after 07:00Z = 09:49Z..10:29Z.
  assertEquals(range(result.feed), {
    start: "2026-10-29T09:49:00.000Z",
    end: "2026-10-29T10:29:00.000Z",
    basis: "blend",
    samples: 5,
  });
  // Wake: w = 4/10, band middle 105: 0.4 × 120 + 0.6 × 105 = 111, ±15 = 96..126,
  // cut to the band max 120. After 07:00Z: 08:36Z..09:00Z.
  assertEquals(range(result.nap), {
    start: "2026-10-29T08:36:00.000Z",
    end: "2026-10-29T09:00:00.000Z",
    basis: "blend",
    samples: 4,
  });
  // One night start (< 2): the age band 19:00–21:00 local = 17:00Z..19:00Z.
  assertEquals(range(result.bedtime), {
    start: "2026-10-29T17:00:00.000Z",
    end: "2026-10-29T19:00:00.000Z",
    basis: "age",
    samples: 1,
  });
});

Deno.test("open daytime sleep: no nap window, expected wake from nap lengths", () => {
  // Now 29 Oct 15:30 local = 13:30Z; nap 3 started 15:00 local (13:00Z).
  // History from 22 Oct 16:30 local, so 22 Oct's 15:00 nap is out.
  const now = new Date("2026-10-29T13:30:00Z");
  const events = dailyEvents(THREE_MONTH_SCHEDULE, now, BUCHAREST);
  const result = predict({ now, zone: BUCHAREST, birthDate: THREE_MONTH_SCHEDULE.birthDate, events });
  assertEquals(result.nap, { window: null, reason: "asleep" });
  // Naps 23–28 Oct: 90, 90, 75 each (18) + 29 Oct: 90, 90 = 20; 6×75, 14×90,
  // median 90. Personal (>= 6), ±20 = 70..110 after 13:00Z = 14:10Z..14:50Z.
  assertEquals(range(result.wake), {
    start: "2026-10-29T14:10:00.000Z",
    end: "2026-10-29T14:50:00.000Z",
    basis: "personal",
    samples: 20,
  });
});

Deno.test("open night sleep: no wake range, bedtime moves to tomorrow", () => {
  // Now 29 Oct 21:00 local = 19:00Z; the night sleep started 19:30 local.
  // History from 22 Oct 22:00 local, so nights 23–28 Oct: 6 samples at 19:30.
  const now = new Date("2026-10-29T19:00:00Z");
  const events = dailyEvents(THREE_MONTH_SCHEDULE, now, BUCHAREST);
  const result = predict({ now, zone: BUCHAREST, birthDate: THREE_MONTH_SCHEDULE.birthDate, events });
  assertEquals(result.nap, { window: null, reason: "asleep" });
  assertEquals(result.wake, { window: null, reason: "night_sleep" });
  // Tomorrow 19:00..20:00 local = 30 Oct 17:00Z..18:00Z.
  assertEquals(range(result.bedtime), {
    start: "2026-10-30T17:00:00.000Z",
    end: "2026-10-30T18:00:00.000Z",
    basis: "personal",
    samples: 6,
  });
  assertEquals(win(result.routine)?.start, "2026-10-30T16:30:00.000Z");
});

Deno.test("clamping: a personal median above the band stays inside it", () => {
  // 13-week-old fed every 5 h: 13 feeds, 12 intervals of 300 > band max 240.
  // Centre clamped to 240, ±20 cut to the band: 220..240 after the last feed
  // (12:00Z) = 15:40Z..16:00Z.
  const now = new Date("2026-10-29T12:30:00Z");
  const last = Date.parse("2026-10-29T12:00:00Z");
  const events = Array.from(
    { length: 13 },
    (_, k) => feedAt(new Date(last - k * 5 * 3_600_000).toISOString()),
  );
  const result = predict({ now, zone: BUCHAREST, birthDate: "2026-07-29", events });
  assertEquals(range(result.feed), {
    start: "2026-10-29T15:40:00.000Z",
    end: "2026-10-29T16:00:00.000Z",
    basis: "personal",
    samples: 12,
  });
});

Deno.test("DST: bedtime at 20:00 local every night across 25 Oct stays 20:00", () => {
  // 20-week-old (born 10 Jun, 140 days on 28 Oct): bedtime band 19:00–20:30.
  // Night sleeps start 20:00 local: UTC+3 until 24 Oct (17:00Z), UTC+2 from
  // 25 Oct (18:00Z). Each ends 06:00 local next day.
  const now = new Date("2026-10-28T10:00:00Z"); // 12:00 local
  const events = [
    sleepAt("2026-10-21T17:00:00Z", "2026-10-22T03:00:00Z"),
    sleepAt("2026-10-22T17:00:00Z", "2026-10-23T03:00:00Z"),
    sleepAt("2026-10-23T17:00:00Z", "2026-10-24T03:00:00Z"),
    sleepAt("2026-10-24T17:00:00Z", "2026-10-25T04:00:00Z"), // the 11-hour night (clocks back)
    sleepAt("2026-10-25T18:00:00Z", "2026-10-26T04:00:00Z"),
    sleepAt("2026-10-26T18:00:00Z", "2026-10-27T04:00:00Z"),
    sleepAt("2026-10-27T18:00:00Z", "2026-10-28T04:00:00Z"),
  ];
  const input = { now, birthDate: "2026-06-10", events };

  // IANA: all 7 starts are 20:00 local, median 20:00, ±30 = 19:30..20:30 local
  // on 28 Oct (UTC+2) = 17:30Z..18:30Z.
  const iana = predict({ ...input, zone: BUCHAREST });
  assertEquals(iana.age_weeks, 20);
  assertEquals(range(iana.bedtime), {
    start: "2026-10-28T17:30:00.000Z",
    end: "2026-10-28T18:30:00.000Z",
    basis: "personal",
    samples: 7,
  });

  // A fixed +2 offset reads the first four as 19:00: median 19:00, window
  // 19:00..19:30 = 17:00Z..17:30Z, an hour early. This is why the zone matters.
  const fixed = predict({ ...input, zone: OFFSET_PLUS_2 });
  assertEquals(range(fixed.bedtime), {
    start: "2026-10-28T17:00:00.000Z",
    end: "2026-10-28T17:30:00.000Z",
    basis: "personal",
    samples: 7,
  });
});

Deno.test("DST: a feed interval across the change is measured in real minutes", () => {
  // Feeds at 02:00 local (UTC+3, 24 Oct 23:00Z) and 05:00 local (UTC+2, 03:00Z):
  // 3 wall-clock hours, 4 real ones. With three earlier 4 h gaps that is 4
  // intervals of 240 (blend, w = 4/12); read as wall clock the last would be 180.
  // Born 26 Jul: 91 days on 25 Oct = 13 weeks, feed band 150..240 (middle 195).
  // 1/3 × 240 + 2/3 × 195 = 210, ±20 = 190..230 after the last feed.
  const feeds = [
    "2026-10-24T11:00:00Z",
    "2026-10-24T15:00:00Z",
    "2026-10-24T19:00:00Z",
    "2026-10-24T23:00:00Z",
    "2026-10-25T03:00:00Z",
  ];
  const result = predict({
    now: new Date("2026-10-25T03:30:00Z"),
    zone: BUCHAREST,
    birthDate: "2026-07-26",
    events: feeds.map(feedAt),
  });
  assertEquals(range(result.feed), {
    start: "2026-10-25T06:10:00.000Z",
    end: "2026-10-25T06:50:00.000Z",
    basis: "blend",
    samples: 4,
  });
});

Deno.test("both breast sides count as one feed", () => {
  // 07:00Z, then left at 10:00Z and right at 10:20Z: one cluster at 10:00Z.
  // One interval (180) -> age band 150..240 after 10:00Z = 12:30Z..14:00Z.
  const result = predict({
    now: new Date("2026-10-29T10:30:00Z"),
    zone: BUCHAREST,
    birthDate: "2026-07-29",
    events: [feedAt("2026-10-29T07:00:00Z"), feedAt("2026-10-29T10:00:00Z"), feedAt("2026-10-29T10:20:00Z")],
  });
  assertEquals(range(result.feed), {
    start: "2026-10-29T12:30:00.000Z",
    end: "2026-10-29T14:00:00.000Z",
    basis: "age",
    samples: 1,
  });
});

Deno.test("a nap that would start at bedtime is reported as bedtime_next", () => {
  // 13-week-old, now 18:00 local (16:00Z). Slept 17:00–17:30 local; wake band
  // 90..120 puts the nap at 19:00 local, not before the age bedtime start 19:00.
  const result = predict({
    now: new Date("2026-10-29T16:00:00Z"),
    zone: BUCHAREST,
    birthDate: "2026-07-29",
    events: [sleepAt("2026-10-29T15:00:00Z", "2026-10-29T15:30:00Z")],
  });
  assertEquals(result.nap, { window: null, reason: "bedtime_next" });
  assertEquals(range(result.bedtime), {
    start: "2026-10-29T17:00:00.000Z",
    end: "2026-10-29T19:00:00.000Z",
    basis: "age",
    samples: 0,
  });
});

Deno.test("an overdue window is still returned; no events gives reasons", () => {
  // Newborn fed at 08:00 local (06:00Z); now 14:30 local. Window 08:00Z..09:00Z is past.
  const now = new Date("2026-10-29T12:30:00Z");
  const overdue = predict({
    now,
    zone: BUCHAREST,
    birthDate: "2026-10-08",
    events: [feedAt("2026-10-29T06:00:00Z")],
  });
  assertEquals(win(overdue.feed)?.end, "2026-10-29T09:00:00.000Z");

  const none = predict({ now, zone: BUCHAREST, birthDate: "2026-07-29", events: [] });
  assertEquals(none.feed, { window: null, reason: "no_feed_logged" });
  assertEquals(none.nap, { window: null, reason: "no_sleep_logged" });
  // Bedtime still comes from the age band.
  assertEquals(win(none.bedtime)?.basis, "age");
});

Deno.test("events older than 7 days or in the future are ignored", () => {
  const now = new Date("2026-10-29T12:30:00Z");
  const result = predict({
    now,
    zone: BUCHAREST,
    birthDate: "2026-07-29",
    events: [feedAt("2026-10-20T12:00:00Z"), feedAt("2026-10-29T18:00:00Z")],
  });
  assertEquals(result.feed, { window: null, reason: "no_feed_logged" });
});
