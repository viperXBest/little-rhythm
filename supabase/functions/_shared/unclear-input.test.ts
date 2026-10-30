import { assertEquals } from "jsr:@std/assert@1.0.13";

import { looksGarbled, mentionsTime, NOW_SLACK_MS, timeAssumed } from "./unclear-input.ts";

Deno.test("mentionsTime: clock, relative and 'now' times, English and Romanian", () => {
  for (
    const text of [
      "she drank 90 ml at 3",
      "Maia just went to sleep one hour ago",
      "woke up 20 minutes ago",
      "asleep now",
      "fell asleep at half past two",
      "a adormit acum o oră",
      "a mâncat la ora 3",
      "scutec ud adineauri",
      // Words that end in a diacritic: need Unicode-aware edges.
      "a dormit două ore",
      "a adormit cu o oră în urmă",
    ]
  ) assertEquals(mentionsTime(text), true, text);
  for (
    const text of [
      "wet diaper",
      "she's asleep",
      "majestuentu слипу anawarga Ok, map that please",
      "scutec ud",
      // "ora" inside another word doesn't count.
      "a mâncat cu poftă, oranj",
    ]
  ) {
    assertEquals(mentionsTime(text), false, text);
  }
});

Deno.test("looksGarbled: mixed alphabets or a replacement character", () => {
  assertEquals(looksGarbled("majestuentu слипу anawarga Ok, map that please"), true);
  assertEquals(looksGarbled("she slept � at 3"), true);
  assertEquals(looksGarbled("Maia just went to sleep one hour ago"), false);
  assertEquals(looksGarbled("a dormit două ore, scutec ud"), false);
  // A single stray letter from another alphabet isn't enough.
  assertEquals(looksGarbled("90 ml bottle, π"), false);
});

Deno.test("timeAssumed: the model's flag, nearness to now, and the message", () => {
  const now = new Date("2026-10-28T00:00:00Z");
  const atNow = now.toISOString();
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const pastSlack = new Date(now.getTime() - NOW_SLACK_MS - 60_000).toISOString();
  assertEquals(timeAssumed({ timeStated: false, time: hourAgo, now, text: "an hour ago" }), true);
  assertEquals(timeAssumed({ timeStated: undefined, time: atNow, now, text: "asleep now" }), true);
  assertEquals(timeAssumed({ timeStated: true, time: atNow, now, text: "asleep now" }), false);
  assertEquals(timeAssumed({ timeStated: true, time: atNow, now, text: "wet diaper" }), true);
  assertEquals(timeAssumed({ timeStated: true, time: hourAgo, now, text: "wet diaper" }), false);
  assertEquals(timeAssumed({ timeStated: true, time: pastSlack, now, text: "wet diaper" }), false);
  // Garbled, even with a time word in it ("now"), at now: still flagged.
  assertEquals(timeAssumed({ timeStated: true, time: atNow, now, text: "слипу now anawarga" }), true);
});
