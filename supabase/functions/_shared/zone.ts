// Time zones for predictions. An IANA zone gives the right local time on both
// sides of a DST change; a fixed UTC offset is only the fallback when the phone
// sends no usable zone name. Pure: no I/O.

import { TZ_OFFSET } from "./agent-schemas.ts";

export type Zone = { kind: "iana"; name: string } | { kind: "offset"; minutes: number };

export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;
export const MAX_TZ_NAME = 64;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(name: string): Intl.DateTimeFormat {
  let f = formatters.get(name);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: name,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(name, f);
  }
  return f;
}

/** True when the runtime knows this IANA zone name. */
export function isValidTimeZone(name: string): boolean {
  if (name.length === 0 || name.length > MAX_TZ_NAME) return false;
  try {
    formatter(name);
    return true;
  } catch {
    return false;
  }
}

/** The zone from a request: the IANA name when valid, else the offset, else null. */
export function parseZone(tz: string | undefined, offsetMinutes: number | undefined): Zone | null {
  if (tz !== undefined && isValidTimeZone(tz)) return { kind: "iana", name: tz };
  if (
    offsetMinutes !== undefined && Number.isInteger(offsetMinutes) &&
    offsetMinutes >= TZ_OFFSET.min && offsetMinutes <= TZ_OFFSET.max
  ) {
    return { kind: "offset", minutes: offsetMinutes };
  }
  return null;
}

/** Minutes east of UTC at instant `ms`. */
export function offsetAt(zone: Zone, ms: number): number {
  if (zone.kind === "offset") return zone.minutes;
  const parts: Record<string, number> = {};
  for (const part of formatter(zone.name).formatToParts(new Date(ms))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((wall - Math.floor(ms / 1000) * 1000) / MS_PER_MINUTE);
}

/** Local calendar day (days since 1970-01-01) and minute of day at instant `ms`. */
export function localParts(zone: Zone, ms: number): { day: number; minute: number } {
  const wall = ms + offsetAt(zone, ms) * MS_PER_MINUTE;
  const day = Math.floor(wall / MS_PER_DAY);
  return { day, minute: Math.floor((wall - day * MS_PER_DAY) / MS_PER_MINUTE) };
}

/** The instant of local `day` at `minute` (may exceed 1440 to roll into the next day). */
export function localToUtc(zone: Zone, day: number, minute: number): number {
  const wall = day * MS_PER_DAY + minute * MS_PER_MINUTE;
  const guess = wall - offsetAt(zone, wall) * MS_PER_MINUTE;
  return wall - offsetAt(zone, guess) * MS_PER_MINUTE;
}

/** Days since 1970-01-01 for a YYYY-MM-DD date. */
export function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_DAY);
}

/** Wall-clock time in the zone, for the model: "2026-10-28T16:53". */
export function toZoneLocalTime(iso: string | Date, zone: Zone): string {
  const ms = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  return new Date(ms + offsetAt(zone, ms) * MS_PER_MINUTE).toISOString().slice(0, 16);
}
