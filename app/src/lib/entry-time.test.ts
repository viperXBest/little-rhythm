// Run with Deno (the app has no JS test runner):
//   deno test app/src/lib/entry-time.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";

import {
  birthDayStart,
  type EntryDraft,
  FUTURE_SLACK_MS,
  inRange,
  MINUTES_RANGE,
  ML_RANGE,
  savedForText,
  sleepOverlaps,
  type SleepSpan,
  validateEntry,
} from "./entry-time.ts";

// Local-time dates, so the tests don't depend on the machine's time zone.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);
const NOW = at(3, 12, 0);
const BIRTH = "2026-08-01";

const sleepSpan = (id: string, from: Date, to: Date | null): SleepSpan => ({
  id,
  started_at: from.toISOString(),
  ended_at: to ? to.toISOString() : null,
});

const diaper = (start: Date, birthDate: string | null = BIRTH): EntryDraft => ({
  type: "diaper",
  start,
  birthDate,
  now: NOW,
});
const feed = (
  feedAmount: { kind: "bottle"; ml: number } | { kind: "breast"; minutes: number },
): EntryDraft => ({
  type: "feed",
  start: at(3, 9),
  birthDate: BIRTH,
  now: NOW,
  feed: feedAmount,
});
const sleep = (
  start: Date,
  end: Date | null,
  rest: { others?: SleepSpan[]; ignoreId?: string; allowOpen?: boolean } = {},
): EntryDraft => ({
  type: "sleep",
  start,
  end,
  birthDate: BIRTH,
  now: NOW,
  ...rest,
});
const code = (draft: EntryDraft) => validateEntry(draft)?.code ?? null;

Deno.test("the ranges are the ones the app and the chat use", () => {
  assertEquals(ML_RANGE, { min: 5, max: 400 });
  assertEquals(MINUTES_RANGE, { min: 1, max: 90 });
  assertEquals([inRange(4, ML_RANGE), inRange(5, ML_RANGE), inRange(400, ML_RANGE), inRange(401, ML_RANGE)], [
    false,
    true,
    true,
    false,
  ]);
  assertEquals(inRange(90.5, ML_RANGE), false);
});

Deno.test("a time in the past is fine, and so is now", () => {
  assertEquals(code(diaper(at(2, 23, 30))), null);
  assertEquals(code(diaper(NOW)), null);
});

Deno.test("the future is rejected, with a little slack for clock drift", () => {
  assertEquals(code(diaper(new Date(NOW.getTime() + FUTURE_SLACK_MS))), null);
  assertEquals(code(diaper(new Date(NOW.getTime() + FUTURE_SLACK_MS + 1))), "future_start");
  assertEquals(code(diaper(at(3, 18))), "future_start");
  assertEquals(code(feed({ kind: "bottle", ml: 90 })), null);
  assertEquals(validateEntry(sleep(at(3, 18), at(3, 19)))?.code, "future_start");
});

Deno.test("an invalid date is rejected instead of crashing toISOString", () => {
  assertEquals(code(diaper(new Date(Number.NaN))), "invalid_time");
  assertEquals(code(sleep(at(3, 1), new Date(Number.NaN))), "invalid_time");
});

Deno.test("a time before the birth date is rejected; the birth day itself is allowed", () => {
  assertEquals(code(diaper(at(3, 9), "2026-11-04")), "before_birth");
  assertEquals(code(diaper(new Date(2026, 7, 1, 0, 0), BIRTH)), null);
  assertEquals(code(diaper(new Date(2026, 6, 31, 23, 59), BIRTH)), "before_birth");
  assertEquals(code(sleep(new Date(2026, 6, 31, 22, 0), new Date(2026, 6, 31, 23, 0))), "before_birth");
});

Deno.test("no birth date, or a malformed one, skips the birth check", () => {
  assertEquals(code(diaper(new Date(2020, 0, 1), null)), null);
  assertEquals(code(diaper(new Date(2020, 0, 1), "yesterday")), null);
  assertEquals(birthDayStart("2026-08-01")?.getTime(), new Date(2026, 7, 1).getTime());
  assertEquals(birthDayStart(null), null);
});

Deno.test("a bottle must be 5 to 400 ml", () => {
  assertEquals(code(feed({ kind: "bottle", ml: 4 })), "amount_range");
  assertEquals(code(feed({ kind: "bottle", ml: 5 })), null);
  assertEquals(code(feed({ kind: "bottle", ml: 400 })), null);
  assertEquals(code(feed({ kind: "bottle", ml: 401 })), "amount_range");
  assertEquals(code(feed({ kind: "bottle", ml: 90.5 })), "amount_range");
});

Deno.test("a breast feed must be 1 to 90 minutes", () => {
  assertEquals(code(feed({ kind: "breast", minutes: 0 })), "duration_range");
  assertEquals(code(feed({ kind: "breast", minutes: 1 })), null);
  assertEquals(code(feed({ kind: "breast", minutes: 90 })), null);
  assertEquals(code(feed({ kind: "breast", minutes: 91 })), "duration_range");
});

Deno.test("a sleep needs an end, unless it is an open sleep being edited", () => {
  assertEquals(code(sleep(at(3, 1), null)), "end_missing");
  assertEquals(code(sleep(at(3, 1), null, { allowOpen: true })), null);
});

Deno.test("the end must be after the start: equal and earlier are rejected", () => {
  assertEquals(code(sleep(at(3, 1), at(3, 3))), null);
  assertEquals(code(sleep(at(3, 1), at(3, 1, 1))), null);
  assertEquals(code(sleep(at(3, 1), at(3, 1))), "end_not_after_start");
  assertEquals(code(sleep(at(3, 3), at(3, 1))), "end_not_after_start");
});

Deno.test("the end can't be in the future", () => {
  assertEquals(code(sleep(at(3, 10), at(3, 18))), "future_end");
  assertEquals(code(sleep(at(3, 10), NOW)), null);
});

Deno.test("a past sleep that overlaps the open sleep is rejected", () => {
  const open = [sleepSpan("open", at(3, 10), null)];
  // Ends after the open sleep started.
  assertEquals(code(sleep(at(3, 9), at(3, 11), { others: open })), "overlap");
  // Entirely inside the time the open sleep has been running.
  assertEquals(code(sleep(at(3, 10, 30), at(3, 11), { others: open })), "overlap");
  // Ends before it started, or exactly as it started.
  assertEquals(code(sleep(at(3, 8), at(3, 9, 59), { others: open })), null);
  assertEquals(code(sleep(at(3, 8), at(3, 10), { others: open })), null);
});

Deno.test("a past sleep that overlaps a logged sleep is rejected, however they intersect", () => {
  const logged = [sleepSpan("a", at(2, 20), at(3, 6))];
  assertEquals(code(sleep(at(2, 19), at(2, 21), { others: logged })), "overlap"); // clips the start
  assertEquals(code(sleep(at(3, 5), at(3, 7), { others: logged })), "overlap"); // clips the end
  assertEquals(code(sleep(at(2, 22), at(3, 1), { others: logged })), "overlap"); // inside it
  assertEquals(code(sleep(at(2, 18), at(3, 8), { others: logged })), "overlap"); // around it
  assertEquals(code(sleep(at(2, 18), at(2, 20), { others: logged })), null); // ends as it starts
  assertEquals(code(sleep(at(3, 6), at(3, 8), { others: logged })), null); // starts as it ends
  assertEquals(code(sleep(at(3, 7), at(3, 8), { others: logged })), null);
});

Deno.test("with no neighbours given, the overlap test is skipped", () => {
  assertEquals(code(sleep(at(3, 9), at(3, 11))), null);
  assertEquals(code(sleep(at(3, 9), at(3, 11), { others: [] })), null);
});

Deno.test("editing a sleep doesn't overlap itself, but still overlaps the others", () => {
  const rows = [sleepSpan("me", at(3, 1), at(3, 3)), sleepSpan("next", at(3, 5), at(3, 6))];
  // Moving "me" into its own old slot.
  assertEquals(code(sleep(at(3, 2), at(3, 4), { others: rows, ignoreId: "me" })), null);
  assertEquals(code(sleep(at(3, 2), at(3, 4), { others: rows })), "overlap");
  // Stretching it into the next sleep.
  assertEquals(code(sleep(at(3, 2), at(3, 5, 30), { others: rows, ignoreId: "me" })), "overlap");
});

Deno.test("an open sleep being edited overlaps any sleep that ends after its start", () => {
  const rows = [sleepSpan("open", at(3, 10), null), sleepSpan("earlier", at(3, 6), at(3, 8))];
  assertEquals(code(sleep(at(3, 10), null, { allowOpen: true, others: rows, ignoreId: "open" })), null);
  assertEquals(code(sleep(at(3, 7), null, { allowOpen: true, others: rows, ignoreId: "open" })), "overlap");
  assertEquals(code(sleep(at(3, 8), null, { allowOpen: true, others: rows, ignoreId: "open" })), null);
});

Deno.test("sleepOverlaps on its own", () => {
  const rows = [sleepSpan("a", at(3, 1), at(3, 2))];
  assertEquals(sleepOverlaps(at(3, 1, 30), at(3, 3), rows), true);
  assertEquals(sleepOverlaps(at(3, 1, 30), at(3, 3), rows, "a"), false);
  assertEquals(sleepOverlaps(at(3, 2), at(3, 3), rows), false);
  assertEquals(sleepOverlaps(at(3, 1, 30), null, rows), true);
  assertEquals(sleepOverlaps(at(3, 2), null, rows), false);
  assertEquals(sleepOverlaps(at(3, 0), at(3, 4), []), false);
});

Deno.test("the first broken rule is the one reported", () => {
  // Future start and an end before the start: the start comes first.
  assertEquals(code(sleep(at(3, 18), at(3, 17))), "future_start");
  assertEquals(validateEntry(diaper(at(3, 18)))?.message, "The time can’t be in the future.");
  assertEquals(validateEntry(sleep(at(3, 18), at(3, 19)))?.message, "The start can’t be in the future.");
});

Deno.test("the day label starts with Saved for and names the day", () => {
  const text = savedForText(at(2, 14));
  assert(text.startsWith("Saved for "));
  assert(text.includes("2"));
});
