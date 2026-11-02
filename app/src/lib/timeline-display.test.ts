// Run with Deno (the app has no JS test runner):
//   deno test app/src/lib/timeline-display.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assertEquals } from "jsr:@std/assert@1.0.13";

import { eventVisual, timelineRowLabel } from "./timeline-display.ts";

Deno.test("feeds use the bottle icon unless breast", () => {
  assertEquals(eventVisual("feed", "bottle"), { icon: "feed", soft: "feedSoft" });
  assertEquals(eventVisual("feed", null), { icon: "feed", soft: "feedSoft" });
  assertEquals(eventVisual("feed", "breast"), { icon: "breastFeed", soft: "feedSoft" });
});

Deno.test("sleep and diaper", () => {
  assertEquals(eventVisual("sleep"), { icon: "sleep", soft: "sleepSoft" });
  assertEquals(eventVisual("diaper"), { icon: "diaper", soft: "diaperSoft" });
});

Deno.test("row label combines the visible strings", () => {
  assertEquals(timelineRowLabel("Bottle · 140 ml", "09:13", true), "Bottle · 140 ml, 09:13, by your partner");
  assertEquals(timelineRowLabel("Sleep · 1h 19m", "07:49–09:08", false), "Sleep · 1h 19m, 07:49–09:08");
});
