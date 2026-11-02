import { assertEquals } from "jsr:@std/assert@1";

import { feedLabel, withUnit } from "./units.ts";

Deno.test("a number and its unit are joined by a non-breaking space", () => {
  assertEquals(withUnit(90, "ml"), "90 ml");
  assertEquals(withUnit(14, "min").includes(" "), false);
});

Deno.test("feed labels keep the unit with its number", () => {
  assertEquals(feedLabel({ kind: "bottle", ml: 90 }), "Bottle · 90 ml");
  assertEquals(feedLabel({ kind: "breast", side: "right", minutes: 14 }), "Breast · right · 14 min");
});
