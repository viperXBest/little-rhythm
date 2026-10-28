import { assertEquals } from "jsr:@std/assert@1.0.13";

import {
  type ProposalContext,
  resolveTimestamp,
  toLocalTime,
  toProposal,
  type WriteTool,
} from "./agent-schemas.ts";

// 02:00 on 28 Oct 2026 in Bucharest (EET, UTC+2).
const NOW = new Date("2026-10-28T00:00:00Z");
const ctx = (over: Partial<ProposalContext> = {}): ProposalContext => ({
  now: NOW,
  offsetMinutes: 120,
  openSleep: null,
  ...over,
});
const propose = (tool: WriteTool, args: unknown, c = ctx()) =>
  toProposal(tool, JSON.stringify(args), c, "p1");
const codes = (p: { errors: { field: string; code: string }[] }) =>
  Object.fromEntries(p.errors.map((e) => [e.field, e.code]));

Deno.test("bottle ml range edges", () => {
  const at = "2026-10-28T01:30";
  for (const [ml, ok] of [[4, false], [5, true], [400, true], [401, false]] as const) {
    const p = propose("log_feed", { kind: "bottle", started_at: at, ml });
    assertEquals(codes(p), ok ? {} : { ml: "out_of_range" }, `ml ${ml}`);
  }
});

Deno.test("breast minutes range edges and side enum", () => {
  const at = "2026-10-28T01:30";
  for (const [minutes, ok] of [[0, false], [1, true], [90, true], [91, false]] as const) {
    const p = propose("log_feed", { kind: "breast", started_at: at, side: "left", minutes });
    assertEquals(codes(p), ok ? {} : { minutes: "out_of_range" }, `minutes ${minutes}`);
  }
  const both = propose("log_feed", { kind: "breast", started_at: at, side: "both", minutes: 10 });
  assertEquals(codes(both), { side: "invalid" });
  assertEquals(both.type === "feed" && both.details, { kind: "breast", minutes: 10 });
});

Deno.test("fractional ml is invalid, missing per-kind fields are required", () => {
  const at = "2026-10-28T01:30";
  assertEquals(codes(propose("log_feed", { kind: "bottle", started_at: at, ml: 90.5 })), { ml: "invalid" });
  assertEquals(codes(propose("log_feed", { kind: "bottle", started_at: at })), { ml: "required" });
  assertEquals(
    codes(propose("log_feed", { kind: "breast", started_at: at })),
    { side: "required", minutes: "required" },
  );
});

Deno.test("valid bottle feed resolves local time to UTC", () => {
  const p = propose("log_feed", { kind: "bottle", started_at: "2026-10-28T01:30", ml: 90 });
  assertEquals(p, {
    id: "p1",
    type: "feed",
    started_at: "2026-10-27T23:30:00.000Z",
    details: { kind: "bottle", ml: 90 },
    errors: [],
  });
});

Deno.test("malformed JSON becomes an error proposal, not a drop", () => {
  const p = toProposal("log_feed", "{kind: bottle", ctx(), "p1");
  assertEquals(p.type, "feed");
  assertEquals(codes(p), { arguments: "invalid_arguments", kind: "required", started_at: "required" });
  assertEquals(codes(toProposal("log_diaper", "[1,2]", ctx(), "p1")).arguments, "invalid_arguments");
});

Deno.test("diaper needs wet or dirty", () => {
  const at = "2026-10-28T01:59";
  assertEquals(codes(propose("log_diaper", { started_at: at, wet: false, dirty: false })), {
    details: "wet_or_dirty",
  });
  const ok = propose("log_diaper", { started_at: at, wet: true, dirty: true });
  assertEquals(codes(ok), {});
  assertEquals(ok.type === "diaper" && ok.details, { wet: true, dirty: true });
});

Deno.test("sleep ended_at before started_at", () => {
  const p = propose("log_sleep", { started_at: "2026-10-28T01:00", ended_at: "2026-10-28T00:30" });
  assertEquals(codes(p), { ended_at: "before_start" });
});

Deno.test("open-ended sleep while one is already open is flagged", () => {
  const openSleep = { id: "s1", started_at: "2026-10-27T22:00:00+00:00" };
  const p = propose("log_sleep", { started_at: "2026-10-28T01:50" }, ctx({ openSleep }));
  assertEquals(codes(p), { ended_at: "sleep_already_open" });
  assertEquals(codes(propose("log_sleep", { started_at: "2026-10-28T01:50" })), {});
});

Deno.test("end_sleep closes the server-supplied open sleep", () => {
  const openSleep = { id: "s1", started_at: "2026-10-27T22:00:00+00:00" };
  const p = propose("end_sleep", { ended_at: "2026-10-28T01:40", sleep_id: "evil" }, ctx({ openSleep }));
  assertEquals(p, {
    id: "p1",
    type: "sleep_end",
    sleep_id: "s1",
    started_at: "2026-10-27T22:00:00.000Z",
    ended_at: "2026-10-27T23:40:00.000Z",
    errors: [],
  });
});

Deno.test("end_sleep errors: before start, in future, no open sleep", () => {
  const openSleep = { id: "s1", started_at: "2026-10-27T23:00:00Z" };
  assertEquals(
    codes(propose("end_sleep", { ended_at: "2026-10-28T00:30" }, ctx({ openSleep }))),
    { ended_at: "before_start" },
  );
  assertEquals(
    codes(propose("end_sleep", { ended_at: "2026-10-28T03:00" }, ctx({ openSleep }))),
    { ended_at: "in_future" },
  );
  const none = propose("end_sleep", { ended_at: "2026-10-28T01:40" });
  assertEquals(codes(none), { sleep: "no_open_sleep" });
  assertEquals(none.type === "sleep_end" && none.sleep_id, null);
});

Deno.test('"at 3" said at 02:00 local: a 03:00 today proposal is flagged in_future, not dropped', () => {
  const p = propose("log_feed", { kind: "bottle", started_at: "2026-10-28T03:00", ml: 90 });
  assertEquals(p.type, "feed");
  assertEquals(p.started_at, null);
  assertEquals(codes(p), { started_at: "in_future" });
  assertEquals(p.type === "feed" && p.details, { kind: "bottle", ml: 90 });
  // The most recent past 3 o'clock (15:00 yesterday) is accepted.
  assertEquals(
    propose("log_feed", { kind: "bottle", started_at: "2026-10-27T15:00", ml: 90 }).started_at,
    "2026-10-27T13:00:00.000Z",
  );
});

Deno.test("timestamps: explicit zones, skew, too old, garbage", () => {
  const c = ctx();
  assertEquals(resolveTimestamp("2026-10-27T23:30:00Z", c), { ok: true, iso: "2026-10-27T23:30:00.000Z" });
  assertEquals(resolveTimestamp("2026-10-28T02:30:00+03:00", c), {
    ok: true,
    iso: "2026-10-27T23:30:00.000Z",
  });
  assertEquals(resolveTimestamp("2026-10-27T19:00-0430", c), { ok: true, iso: "2026-10-27T23:30:00.000Z" });
  // One minute ahead is clock skew, not the future.
  assertEquals(resolveTimestamp("2026-10-28T02:01", c), { ok: true, iso: "2026-10-28T00:01:00.000Z" });
  assertEquals(resolveTimestamp("2026-10-28T02:03", c), { ok: false, code: "in_future" });
  assertEquals(resolveTimestamp("2026-10-26T01:59", c), { ok: false, code: "too_old" });
  assertEquals(resolveTimestamp("2026-10-26T02:01", c).ok, true);
  for (const bad of ["at 3", "15:00", "2026-02-30T10:00", "2026-10-28T24:00", "2026-10-28T01:00+15:00", ""]) {
    assertEquals(resolveTimestamp(bad, c), { ok: false, code: "invalid_time" }, bad);
  }
});

Deno.test("offset sign: the same wall time differs between EEST (+180) and EET (+120)", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  assertEquals(resolveTimestamp("2026-10-24T14:00", ctx({ now, offsetMinutes: 180 })), {
    ok: true,
    iso: "2026-10-24T11:00:00.000Z",
  });
  assertEquals(resolveTimestamp("2026-10-24T13:00", ctx({ now, offsetMinutes: 120 })), {
    ok: true,
    iso: "2026-10-24T11:00:00.000Z",
  });
  // West of UTC (New York, EDT = -240).
  assertEquals(resolveTimestamp("2026-10-24T07:00", ctx({ now, offsetMinutes: -240 })), {
    ok: true,
    iso: "2026-10-24T11:00:00.000Z",
  });
});

Deno.test("toLocalTime shows the parent's wall clock", () => {
  assertEquals(toLocalTime("2026-10-27T23:30:00Z", 120), "2026-10-28T01:30");
  assertEquals(toLocalTime(new Date("2026-10-28T00:00:00Z"), -240), "2026-10-27T20:00");
});

Deno.test("injected ids in arguments never reach the proposal", () => {
  const p = propose("log_feed", {
    kind: "bottle",
    started_at: "2026-10-28T01:30",
    ml: 90,
    baby_id: "00000000-0000-0000-0000-00000000beef",
    family_id: "00000000-0000-0000-0000-00000000f00d",
  });
  assertEquals(JSON.stringify(p).includes("beef"), false);
  assertEquals(JSON.stringify(p).includes("f00d"), false);
  assertEquals(codes(p), {});
});
