// Run with Deno (the app has no JS test runner):
//   deno test app/src/lib/earliest.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assertEquals } from "jsr:@std/assert@1.0.13";

import { earliestIndex } from "./earliest.ts";

const at = (hm: string) => ({ start: `2026-11-02T${hm}:00Z` });

Deno.test("picks the window that starts first", () => {
  assertEquals(earliestIndex([at("15:10"), at("15:07"), at("18:15"), at("18:45")]), 1);
});

Deno.test("skips slots without a window", () => {
  assertEquals(earliestIndex([null, at("18:15"), null, at("12:00")]), 3);
});

Deno.test("ties go to the first slot", () => {
  assertEquals(earliestIndex([at("10:00"), at("10:00")]), 0);
});

Deno.test("no windows, no highlight", () => {
  assertEquals(earliestIndex([null, null, null, null]), -1);
  assertEquals(earliestIndex([]), -1);
});

Deno.test("ignores an unparseable start", () => {
  assertEquals(earliestIndex([{ start: "soon" }, at("09:00")]), 1);
});
