// Event fixtures for predict.test.ts and the local seed script
// (scripts/day5-scratch). Times are local wall-clock times in the given zone,
// turned into UTC through the zone, so a schedule stays at the same local
// time across a DST change.

import type { PredictEvent } from "./predict.ts";
import { HISTORY_DAYS } from "./predict-constants.ts";
import { localParts, localToUtc, MS_PER_DAY, type Zone } from "./zone.ts";

export const BUCHAREST: Zone = { kind: "iana", name: "Europe/Bucharest" };

/** A 13-week-old's day (born 2026-07-29), local "HH:MM". */
export const THREE_MONTH_SCHEDULE = {
  birthDate: "2026-07-29",
  // Intervals 3 h ×4 and 4 h ×3 a day: the median is 3 h.
  feeds: ["03:00", "07:00", "10:00", "13:00", "16:00", "19:00", "23:00"],
  // Naps 90, 90, 75 min; night 19:30–07:00. Daytime wake windows 90, 105, 105, 195.
  sleeps: [
    ["08:30", "10:00"],
    ["11:45", "13:15"],
    ["15:00", "16:15"],
    ["19:30", "07:00"],
  ],
} as const;

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Repeats a daily schedule over the last 7 days, as the predict function would
 * read it: events that started since now - 7 days and not after now. A sleep
 * still running at `now` has ended_at null. An end earlier than its start is
 * on the next day.
 */
export function dailyEvents(
  schedule: { feeds: readonly string[]; sleeps: readonly (readonly [string, string])[] },
  now: Date,
  zone: Zone,
): PredictEvent[] {
  const nowMs = now.getTime();
  const since = nowMs - HISTORY_DAYS * MS_PER_DAY;
  const today = localParts(zone, nowMs).day;
  const events: PredictEvent[] = [];
  for (let day = today - HISTORY_DAYS - 1; day <= today; day++) {
    for (const time of schedule.feeds) {
      const start = localToUtc(zone, day, minutes(time));
      if (start >= since && start <= nowMs) {
        events.push({ type: "feed", started_at: iso(start), ended_at: null });
      }
    }
    for (const [from, to] of schedule.sleeps) {
      const start = localToUtc(zone, day, minutes(from));
      const end = localToUtc(zone, minutes(to) < minutes(from) ? day + 1 : day, minutes(to));
      if (start >= since && start <= nowMs) {
        events.push({ type: "sleep", started_at: iso(start), ended_at: end <= nowMs ? iso(end) : null });
      }
    }
  }
  return events.sort((a, b) => a.started_at.localeCompare(b.started_at));
}

export const feedAt = (startedAt: string): PredictEvent => ({
  type: "feed",
  started_at: startedAt,
  ended_at: null,
});
export const sleepAt = (startedAt: string, endedAt: string | null): PredictEvent => ({
  type: "sleep",
  started_at: startedAt,
  ended_at: endedAt,
});

function iso(ms: number): string {
  return new Date(ms).toISOString();
}
