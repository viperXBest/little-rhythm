// Unit tests for the demo timeline (plan.ts) and the seed's --project guard.
// Pure: no stack. Every test uses a fixed clock, so CI passes at any hour.
//   npx -y deno@2 test -A scripts/seed-demo/plan.test.ts
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1.0.13";

import { countNightFeeds } from "../../supabase/functions/_shared/night-feeds.ts";
import {
  localParts,
  localToUtc,
  MS_PER_DAY,
  MS_PER_MINUTE,
  type Zone,
} from "../../supabase/functions/_shared/zone.ts";
import {
  buildPlan,
  HISTORY,
  leads,
  leadsFit,
  type Plan,
  QUIET_BEFORE_ANCHOR_MIN,
  resolveAnchor,
  validAnchorRange,
  ZONE,
} from "./plan.ts";
import { checkProject } from "./seed.ts";

/** 2026-11-04 17:30 in Bucharest (EET, UTC+2): the recording day. The history spans the 25 Oct DST change. */
const NOW = new Date("2026-11-04T15:30:00Z");
const local = (ms: number) => localParts(ZONE, ms);
const atLocal = (day: number, hh: number, mm: number) => new Date(localToUtc(ZONE, day, hh * 60 + mm));
const NOW_DAY = local(NOW.getTime()).day;

function planAt(anchor: Date): Plan {
  const plan = buildPlan(anchor);
  assert(plan, `no plan at ${anchor.toISOString()}`);
  return plan;
}

const isNightMinute = (minute: number) => minute >= 22 * 60 || minute < 6 * 60;

Deno.test("the same anchor gives the same plan", () => {
  assertEquals(JSON.stringify(planAt(NOW)), JSON.stringify(planAt(new Date(NOW.getTime()))));
});

/** Every 15 min of `range` gives a plan with the nap window 15-45 min out and tonight's routine ahead. */
function assertRangeFits(day: number, range: { from: string; to: string }, zone: Zone = ZONE): void {
  const [fromH, fromM] = range.from.split(":").map(Number);
  const [toH, toM] = range.to.split(":").map(Number);
  for (let minute = fromH * 60 + fromM; minute <= toH * 60 + toM; minute += 15) {
    const anchor = new Date(localToUtc(zone, day, minute));
    const plan = buildPlan(anchor, zone);
    assert(plan, `no plan at ${minute}`);
    assertEquals(plan.prediction.age_weeks, 13);
    const l = leads(anchor, plan.prediction);
    assert(leadsFit(l), `${minute}: ${JSON.stringify(l)}`);
    assert(l.nap !== null && l.nap >= 15 && l.nap <= 45);
    assert(l.routine !== null && l.routine >= 0);
    // Tonight's routine, not tomorrow's.
    assertEquals(localParts(zone, Date.parse(plan.prediction.routine.window!.start)).day, day);
    // Today's wake (the end of last night) stays between 05:50 and 08:25.
    const lastNight = plan.events
      .filter((e) => e.type === "sleep" && localParts(zone, Date.parse(e.started_at)).minute >= 18 * 60)
      .at(-1)!;
    const wake = localParts(zone, Date.parse(lastNight.ended_at!)).minute;
    assert(wake >= 5 * 60 + 50 && wake <= 8 * 60 + 25, `${minute}: wake ${wake}`);
  }
}

Deno.test("valid range is computed with the engine and covers the day, not the night", () => {
  const range = validAnchorRange(NOW);
  assert(range);
  assert(range.from <= "07:00" && range.to >= "18:30", `${range.from}-${range.to}`);
  // At night no nap starts before bedtime; after ~18:35 tonight's routine has begun.
  assertEquals(buildPlan(atLocal(NOW_DAY, 3, 0)), null);
  assertEquals(buildPlan(atLocal(NOW_DAY, 21, 0)), null);
  assertRangeFits(NOW_DAY, range);
});

Deno.test("an early-morning take has no nap yet today, and the wake-up feed", () => {
  const anchor = atLocal(NOW_DAY, 7, 30);
  const plan = planAt(anchor);
  const today = plan.events.filter((e) => local(Date.parse(e.started_at)).day === NOW_DAY);
  assertEquals(today.filter((e) => e.type === "sleep").length, 0);
  assert(today.some((e) => e.type === "feed"));
});

Deno.test("--tz: a night-time take in Bucharest works in a zone where it is day", () => {
  // 03:00 in Bucharest is 17:00 the evening before in Los Angeles (PST, UTC-8).
  const night = atLocal(NOW_DAY, 3, 0);
  assertEquals(buildPlan(night), null);
  const la: Zone = { kind: "iana", name: "America/Los_Angeles" };
  const plan = buildPlan(night, la);
  assert(plan);
  assertEquals(localParts(la, night.getTime()).minute, 17 * 60);
  assert(leadsFit(leads(night, plan.prediction)));
  // Same rules in any zone: the range is a local-time range.
  const laDay = localParts(la, NOW.getTime()).day;
  const range = validAnchorRange(NOW, la);
  assert(range);
  assert(range.from <= "07:00" && range.to >= "18:30", `${range.from}-${range.to}`);
  assertEquals(resolveAnchor(night, "17:10", la).ok, true);
  assertRangeFits(laDay, { from: "07:00", to: "18:30" }, la);
});

Deno.test("rows stay within the app's ranges, before the run time, and sleeps never overlap", () => {
  // The usual afternoon take, an early one with no nap yet, and ones that move today's wake.
  for (const [hh, mm] of [[7, 0], [7, 30], [9, 40], [12, 0], [17, 30]]) {
    assertRowsValid(planAt(atLocal(NOW_DAY, hh, mm)));
  }
});

function assertRowsValid(plan: Plan): void {
  const anchor = plan.anchor.getTime();
  const latest = anchor - QUIET_BEFORE_ANCHOR_MIN * MS_PER_MINUTE;
  const earliest = anchor - (HISTORY + 1) * MS_PER_DAY;
  for (const e of plan.events) {
    const start = Date.parse(e.started_at);
    assert(start >= earliest && start <= latest, e.started_at);
    if (e.ended_at) assert(Date.parse(e.ended_at) <= latest && Date.parse(e.ended_at) > start);
    const d = e.details as Record<string, unknown>;
    if (e.type === "feed" && d.kind === "bottle") {
      assert(Number.isInteger(d.ml) && (d.ml as number) >= 5 && (d.ml as number) <= 400);
    } else if (e.type === "feed") {
      assertEquals(d.kind, "breast");
      assert(d.side === "left" || d.side === "right");
      assert(Number.isInteger(d.minutes) && (d.minutes as number) >= 1 && (d.minutes as number) <= 90);
      assertEquals(e.by, "parent1");
    } else if (e.type === "diaper") {
      assert(d.wet === true || d.dirty === true);
    } else {
      assertEquals(d, {});
      assertNotEquals(e.ended_at, null);
    }
  }
  const sleeps = plan.events.filter((e) => e.type === "sleep");
  for (let i = 1; i < sleeps.length; i++) {
    assert(Date.parse(sleeps[i].started_at) >= Date.parse(sleeps[i - 1].ended_at!), sleeps[i].started_at);
  }
  // No seeded chat; check-ins for the past three days only, both parents, today left open.
  const days = [...new Set(plan.checkins.map((c) => c.day))].sort();
  assertEquals(days.length, 3);
  assertEquals(plan.checkins.length, 6);
  const today = new Date(NOW_DAY * MS_PER_DAY).toISOString().slice(0, 10);
  assert(days.every((d) => d < today));
  assert(plan.checkins.every((c) => c.mood >= 1 && c.mood <= 5 && c.help.length <= 280));
}

Deno.test("night feeds split about 60/40 between the parents", () => {
  const plan = planAt(NOW);
  const counts = countNightFeeds({
    feeds: plan.events.filter((e) => e.type === "feed").map((e) => ({
      started_at: e.started_at,
      created_by: e.by,
    })),
    now: NOW,
    zone: ZONE,
    you: "parent1",
    partner: "parent2",
  });
  const total = counts.you + (counts.partner ?? 0);
  assertEquals(total, 14);
  const share = counts.you / total;
  assert(share >= 0.55 && share <= 0.65, `parent1 share ${share}`);
});

/** The fall-back change on `dstIso`'s local day, inside the history of a plan at `anchor` in `zone`. */
function assertDstHistory(zone: Zone, anchor: Date, dstIso: string): void {
  const local = (ms: number) => localParts(zone, ms);
  const plan = buildPlan(anchor, zone);
  assert(plan);
  const anchorDay = local(anchor.getTime()).day;
  const dstDay = local(Date.parse(dstIso)).day;
  const firstFullDay = anchorDay - HISTORY + 1;
  assert(firstFullDay < dstDay - 1 && dstDay < anchorDay);
  for (let day = firstFullDay; day < anchorDay; day++) {
    const ofDay = plan.events.filter((e) => local(Date.parse(e.started_at)).day === day);
    const sleeps = ofDay.filter((e) => e.type === "sleep");
    assertEquals(sleeps.length, 5, `day ${day}: 4 naps and the night`);
    // Day feeds plus the night's two (the 03:30 one and the next evening's 23:00 one).
    assert(ofDay.filter((e) => e.type === "feed").length >= 6, `day ${day}`);
    const early = ofDay.filter((e) => e.type === "feed" && local(Date.parse(e.started_at)).minute < 6 * 60);
    assertEquals(early.length, 1, `day ${day}: one feed between 00:00 and 06:00`);
    // Local slots are unique per type: 03:00-04:00 on the DST day isn't written twice.
    const keys = ofDay.map((e) => `${e.type}@${local(Date.parse(e.started_at)).minute}`);
    assertEquals(new Set(keys).size, keys.length, `day ${day}`);
  }
  // The night across the change is one sleep of at least 4 h (an hour longer in real time).
  const night = plan.events.find((e) =>
    e.type === "sleep" && local(Date.parse(e.started_at)).day === dstDay - 1 &&
    local(Date.parse(e.started_at)).minute >= 18 * 60
  );
  assert(night?.ended_at);
  const hours = (Date.parse(night.ended_at) - Date.parse(night.started_at)) / 3_600_000;
  assert(hours >= 11 && hours <= 12.5, `${hours} h`);
}

Deno.test("DST (25 Oct, EEST to EET): every day is complete and night hours aren't duplicated", () => {
  assertDstHistory(ZONE, NOW, "2026-10-25T12:00:00Z");
});

Deno.test("DST with --tz (1 Nov, PDT to PST in Los Angeles): the same holds", () => {
  const la: Zone = { kind: "iana", name: "America/Los_Angeles" };
  // 4 Nov 17:30 in Los Angeles.
  assertDstHistory(la, new Date("2026-11-05T01:30:00Z"), "2026-11-01T20:00:00Z");
});

Deno.test("DST: night feeds across the change are counted like the plan says", () => {
  // 28 Oct 17:30: the last 7 nights include 24-25 Oct.
  const anchor = atLocal(local(Date.parse("2026-10-28T12:00:00Z")).day, 17, 30);
  const plan = planAt(anchor);
  const anchorDay = local(anchor.getTime()).day;
  const expected = { parent1: 0, parent2: 0 };
  for (const e of plan.events) {
    if (e.type !== "feed") continue;
    const { day, minute } = local(Date.parse(e.started_at));
    if (!isNightMinute(minute)) continue;
    const evening = minute >= 22 * 60 ? day : day - 1;
    if (evening >= anchorDay - 7 && evening <= anchorDay - 1) expected[e.by]++;
  }
  const counts = countNightFeeds({
    feeds: plan.events.filter((e) => e.type === "feed").map((e) => ({
      started_at: e.started_at,
      created_by: e.by,
    })),
    now: anchor,
    zone: ZONE,
    you: "parent1",
    partner: "parent2",
  });
  assertEquals({ parent1: counts.you, parent2: counts.partner }, expected);
  assertEquals(counts.you + (counts.partner ?? 0), 14);
});

Deno.test("--at is compared with the run time at whole minutes", () => {
  const runAt = (hh: number, mm: number, ss: number) =>
    new Date(localToUtc(ZONE, NOW_DAY, hh * 60 + mm) + ss * 1000);
  const ok = resolveAnchor(runAt(17, 0, 40), "17:00");
  assert(ok.ok);
  assertEquals(ok.anchor.getTime(), localToUtc(ZONE, NOW_DAY, 17 * 60));
  assertEquals(resolveAnchor(runAt(17, 0, 40), "16:59"), { ok: false, reason: "before_run" });
  assert(resolveAnchor(runAt(17, 0, 40), "17:30").ok);
  assertEquals(resolveAnchor(runAt(17, 0, 40), "17:31"), { ok: false, reason: "too_far_ahead" });
  assertEquals(resolveAnchor(runAt(17, 0, 0), "7:30"), { ok: false, reason: "bad_format" });
  const plain = resolveAnchor(runAt(17, 0, 40), undefined);
  assert(plain.ok);
  assertEquals(plain.anchor.getTime() % MS_PER_MINUTE, 0);
});

Deno.test("--project must match SUPABASE_URL", () => {
  assertEquals(checkProject("https://abcdefghijklmnopqrst.supabase.co", "abcdefghijklmnopqrst"), null);
  assert(checkProject("https://abcdefghijklmnopqrst.supabase.co", "otherprojectref00000"));
  assert(checkProject("https://abcdefghijklmnopqrst.supabase.co", undefined));
  assert(checkProject("https://abcdefghijklmnopqrst.supabase.co", "local"));
  assert(checkProject("http://abcdefghijklmnopqrst.supabase.co", "abcdefghijklmnopqrst"));
  assertEquals(checkProject("http://127.0.0.1:54321", "local"), null);
  assert(checkProject("http://127.0.0.1:54321", "abcdefghijklmnopqrst"));
  assert(checkProject("not a url", "local"));
});
