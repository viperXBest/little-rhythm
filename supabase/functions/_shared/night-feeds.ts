// Night-feed balance for the couple layer: feeds logged between 22:00 and
// 06:00 local over the last 7 nights, counted per parent who logged them
// (created_by). It counts logs, not who fed the baby, and the app says so.
// Both breast sides are two logs. Pure: no I/O. Served by the predict
// function; never sent to the chat model.

import { localParts, localToUtc, type Zone } from "./zone.ts";

export const NIGHTS = 7;
const NIGHT_START_MINUTE = 22 * 60;
const NIGHT_END_MINUTE = 6 * 60;

export type NightFeedRow = { started_at: string; created_by: string | null };
export type NightFeeds = { nights: number; you: number; partner: number | null };
export type Night = { start: number; end: number };

/**
 * The 7 most recent nights that have started, newest first, as [start, end)
 * instants. Tonight counts once 22:00 local has passed; at 03:00 the current
 * night (from yesterday's evening) is the newest. Built from local clock times,
 * so a night across a DST change is 9 or 7 hours long.
 */
export function recentNights(now: Date, zone: Zone): Night[] {
  const { day, minute } = localParts(zone, now.getTime());
  const newestEvening = minute >= NIGHT_START_MINUTE ? day : day - 1;
  return Array.from({ length: NIGHTS }, (_, i) => {
    const evening = newestEvening - i;
    return {
      start: localToUtc(zone, evening, NIGHT_START_MINUTE),
      end: localToUtc(zone, evening + 1, NIGHT_END_MINUTE),
    };
  });
}

/** Where the feed query starts: the oldest night's 22:00 (can be more than 7×24 h ago). */
export function nightFeedsSince(now: Date, zone: Zone): Date {
  return new Date(recentNights(now, zone)[NIGHTS - 1].start);
}

/**
 * Counts the caller's and the partner's night feeds. Feeds by anyone else (a
 * former member, or a deleted account: created_by null) are not counted.
 * With no partner in the family, partner is null.
 */
export function countNightFeeds(input: {
  feeds: NightFeedRow[];
  now: Date;
  zone: Zone;
  you: string;
  partner: string | null;
}): NightFeeds {
  const nights = recentNights(input.now, input.zone);
  const nowMs = input.now.getTime();
  let you = 0;
  let partner = 0;
  for (const feed of input.feeds) {
    const ms = Date.parse(feed.started_at);
    if (!Number.isFinite(ms) || ms > nowMs) continue;
    if (!nights.some((n) => ms >= n.start && ms < n.end)) continue;
    if (feed.created_by === input.you) you++;
    else if (input.partner !== null && feed.created_by === input.partner) partner++;
  }
  return { nights: NIGHTS, you, partner: input.partner === null ? null : partner };
}
