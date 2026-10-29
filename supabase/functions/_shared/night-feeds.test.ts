import { assertEquals } from "jsr:@std/assert@1.0.13";

import { countNightFeeds, nightFeedsSince, NIGHTS, recentNights } from "./night-feeds.ts";
import { BUCHAREST } from "./predict.fixtures.ts";

const YOU = "aaaaaaaa-0000-4000-8000-000000000001";
const PARTNER = "aaaaaaaa-0000-4000-8000-000000000002";
const FORMER = "bbbbbbbb-0000-4000-8000-000000000003";

const feed = (started_at: string, created_by: string | null) => ({ started_at, created_by });

// Bucharest: EEST (UTC+3) until 04:00 local on Sun 25 Oct 2026, then EET (UTC+2).

Deno.test("DST night: 22:00 Sat to 06:00 Sun is 9 hours, and both 03:30s count", () => {
  // 12:00 local on 25 Oct (EET): the newest night started on the evening of 24 Oct.
  const now = new Date("2026-10-25T10:00:00Z");
  const [newest] = recentNights(now, BUCHAREST);
  assertEquals(new Date(newest.start).toISOString(), "2026-10-24T19:00:00.000Z"); // 22:00 EEST
  assertEquals(new Date(newest.end).toISOString(), "2026-10-25T04:00:00.000Z"); // 06:00 EET
  assertEquals((newest.end - newest.start) / 3_600_000, 9);

  const result = countNightFeeds({
    feeds: [
      feed("2026-10-25T00:30:00Z", YOU), // 03:30 EEST, first time round
      feed("2026-10-25T01:30:00Z", PARTNER), // 03:30 EET, the repeated hour
      feed("2026-10-25T03:59:00Z", PARTNER), // 05:59 EET
      feed("2026-10-25T04:00:00Z", YOU), // 06:00 EET: morning, not night
    ],
    now,
    zone: BUCHAREST,
    you: YOU,
    partner: PARTNER,
  });
  assertEquals(result, { nights: NIGHTS, you: 1, partner: 2 });
});

Deno.test("boundaries: 21:59 and 06:00 are out, 22:00 and 05:59 are in", () => {
  // Winter (UTC+2). Now: 12:00 local on 28 Oct.
  const now = new Date("2026-10-28T10:00:00Z");
  const result = countNightFeeds({
    feeds: [
      feed("2026-10-27T19:59:00Z", YOU), // 21:59
      feed("2026-10-27T20:00:00Z", YOU), // 22:00
      feed("2026-10-28T03:59:00Z", YOU), // 05:59
      feed("2026-10-28T04:00:00Z", YOU), // 06:00
    ],
    now,
    zone: BUCHAREST,
    you: YOU,
    partner: PARTNER,
  });
  assertEquals(result, { nights: NIGHTS, you: 2, partner: 0 });
});

Deno.test("tonight counts only once 22:00 has passed", () => {
  const before = recentNights(new Date("2026-10-28T19:59:00Z"), BUCHAREST); // 21:59 local
  const after = recentNights(new Date("2026-10-28T20:00:00Z"), BUCHAREST); // 22:00 local
  assertEquals(new Date(before[0].start).toISOString(), "2026-10-27T20:00:00.000Z");
  assertEquals(new Date(after[0].start).toISOString(), "2026-10-28T20:00:00.000Z");
  // At 03:00 the current night (from yesterday's evening) is the newest.
  const during = recentNights(new Date("2026-10-29T01:00:00Z"), BUCHAREST);
  assertEquals(new Date(during[0].start).toISOString(), "2026-10-28T20:00:00.000Z");
});

Deno.test("only the 7 most recent nights count, and the query starts at the oldest 22:00", () => {
  const now = new Date("2026-10-28T10:00:00Z"); // 12:00 local
  // Newest night: evening of 27 Oct. Oldest: evening of 21 Oct (EEST, 19:00Z).
  assertEquals(nightFeedsSince(now, BUCHAREST).toISOString(), "2026-10-21T19:00:00.000Z");
  const result = countNightFeeds({
    feeds: [
      feed("2026-10-21T20:00:00Z", YOU), // 23:00 on 21 Oct: 7th night, counted
      feed("2026-10-20T20:00:00Z", YOU), // 23:00 on 20 Oct: 8th night, not counted
    ],
    now,
    zone: BUCHAREST,
    you: YOU,
    partner: PARTNER,
  });
  assertEquals(result.you, 1);
});

Deno.test("no partner yet: partner is null; former members and deleted accounts are not counted", () => {
  const now = new Date("2026-10-28T10:00:00Z");
  const feeds = [
    feed("2026-10-27T22:00:00Z", YOU),
    feed("2026-10-27T23:00:00Z", FORMER),
    feed("2026-10-28T00:00:00Z", null),
  ];
  assertEquals(countNightFeeds({ feeds, now, zone: BUCHAREST, you: YOU, partner: null }), {
    nights: NIGHTS,
    you: 1,
    partner: null,
  });
  assertEquals(countNightFeeds({ feeds, now, zone: BUCHAREST, you: YOU, partner: PARTNER }), {
    nights: NIGHTS,
    you: 1,
    partner: 0,
  });
});

Deno.test("feeds in the future (clock skew) are not counted", () => {
  const now = new Date("2026-10-28T01:00:00Z"); // 03:00 local, mid-night
  const result = countNightFeeds({
    feeds: [feed("2026-10-28T00:00:00Z", YOU), feed("2026-10-28T02:00:00Z", YOU)],
    now,
    zone: BUCHAREST,
    you: YOU,
    partner: null,
  });
  assertEquals(result.you, 1);
});
