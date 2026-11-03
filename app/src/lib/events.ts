import { randomUUID } from 'expo-crypto';

import type { Json, Tables } from '@/lib/database.types';
import {
  inRange,
  MINUTES_RANGE,
  ML_RANGE,
  validateEntry,
  type EntryDraft,
  type EntryProblem,
  type SleepSpan,
} from '@/lib/entry-time';
import { supabase } from '@/lib/supabase';
import { feedLabel } from '@/lib/units';

// The ranges live in entry-time.ts (pure, tested under Deno); existing imports from here keep working.
export { MINUTES_RANGE, ML_RANGE };

export type EventRow = Tables<'events'>;
export type EventType = 'feed' | 'sleep' | 'diaper';
export type EventSource = 'tap' | 'chat' | 'voice';
export type BreastSide = 'left' | 'right';

export type FeedDetails =
  | { kind: 'bottle'; ml: number }
  | { kind: 'breast'; side: BreastSide; minutes: number };
export type DiaperDetails = { wet: boolean; dirty: boolean };

/** Columns members may change after insert (the DB grants update on these only). */
export type EventPatch = Partial<Pick<EventRow, 'started_at' | 'ended_at' | 'details'>>;

function isObject(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Details as written by this app, or null when the row holds something else. */
export function parseFeed(details: Json): FeedDetails | null {
  if (!isObject(details)) return null;
  if (details.kind === 'bottle' && inRange(details.ml, ML_RANGE)) {
    return { kind: 'bottle', ml: details.ml };
  }
  if (
    details.kind === 'breast' &&
    (details.side === 'left' || details.side === 'right') &&
    inRange(details.minutes, MINUTES_RANGE)
  ) {
    return { kind: 'breast', side: details.side, minutes: details.minutes };
  }
  return null;
}

export function parseDiaper(details: Json): DiaperDetails | null {
  if (!isObject(details)) return null;
  if (typeof details.wet !== 'boolean' || typeof details.dirty !== 'boolean') return null;
  if (!details.wet && !details.dirty) return null;
  return { wet: details.wet, dirty: details.dirty };
}

export function isEventType(value: string): value is EventType {
  return value === 'feed' || value === 'sleep' || value === 'diaper';
}

/** A complete row built on the phone, so it can be shown before the server confirms. */
export function newEventRow(input: {
  babyId: string;
  userId: string;
  type: EventType;
  startedAt: Date;
  endedAt?: Date | null;
  details?: FeedDetails | DiaperDetails;
  source?: EventSource;
}): EventRow {
  return {
    id: randomUUID(),
    baby_id: input.babyId,
    type: input.type,
    started_at: input.startedAt.toISOString(),
    ended_at: input.endedAt ? input.endedAt.toISOString() : null,
    details: input.details ?? {},
    created_by: input.userId,
    source: input.source ?? 'tap',
    created_at: new Date().toISOString(),
  };
}

export type WriteError = 'sleep_already_open' | 'failed';

export async function insertEvent(row: EventRow): Promise<WriteError | null> {
  // created_by and created_at come from the database defaults.
  const { error } = await supabase.from('events').insert({
    id: row.id,
    baby_id: row.baby_id,
    type: row.type,
    started_at: row.started_at,
    ended_at: row.ended_at,
    details: row.details,
    source: row.source,
  });
  if (!error) return null;
  return error.code === '23505' ? 'sleep_already_open' : 'failed';
}

/** Sends only the mutable columns; any other column would fail the column grant. */
export async function updateEvent(id: string, patch: EventPatch): Promise<WriteError | null> {
  const body: EventPatch = {};
  if (patch.started_at !== undefined) body.started_at = patch.started_at;
  if (patch.ended_at !== undefined) body.ended_at = patch.ended_at;
  if (patch.details !== undefined) body.details = patch.details;
  const { error } = await supabase.from('events').update(body).eq('id', id);
  return error ? 'failed' : null;
}

/** Ends a sleep unless the partner already ended it. */
export async function stopSleep(id: string, endedAt: Date): Promise<WriteError | null> {
  const { error } = await supabase
    .from('events')
    .update({ ended_at: endedAt.toISOString() })
    .eq('id', id)
    .is('ended_at', null);
  return error ? 'failed' : null;
}

export async function deleteEvent(id: string): Promise<WriteError | null> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  return error ? 'failed' : null;
}

const CHECK_FAILED = 'Could not check your sleeps. Check your connection and try again.';

/**
 * Sleeps that could overlap [start, end): they started before `end` (any start when `end` is null, an
 * open sleep) and are open or ended after `start`. RLS limits this to the caller's baby. Null on failure.
 */
export async function fetchSleepsNear(
  babyId: string,
  start: Date,
  end: Date | null,
  excludeId?: string,
): Promise<SleepSpan[] | null> {
  let query = supabase
    .from('events')
    .select('id, started_at, ended_at')
    .eq('baby_id', babyId)
    .eq('type', 'sleep')
    .or(`ended_at.is.null,ended_at.gt.${start.toISOString()}`);
  if (end) query = query.lt('started_at', end.toISOString());
  if (excludeId) query = query.neq('id', excludeId);
  // One overlapping sleep is enough to refuse; the pure test still runs on whatever comes back.
  const { data, error } = await query.limit(20);
  return error ? null : data;
}

/** The rules in entry-time.ts, plus the sleep-overlap test against the baby's log (sleeps only). */
export async function checkEntry(babyId: string, draft: EntryDraft): Promise<EntryProblem | null> {
  const problem = validateEntry(draft);
  if (problem || draft.type !== 'sleep') return problem;
  const others = await fetchSleepsNear(babyId, draft.start, draft.end, draft.ignoreId);
  if (!others) return { code: 'check_failed', message: CHECK_FAILED };
  return validateEntry({ ...draft, others });
}

/** Start of the phone's local day. */
export function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** True when the event overlaps the day starting at `dayStart`, or is an open sleep. */
export function overlapsDay(row: EventRow, dayStart: Date): boolean {
  if (new Date(row.started_at) >= dayStart) return true;
  if (row.ended_at !== null) return new Date(row.ended_at) >= dayStart;
  // Feeds and diapers have no ended_at; only a sleep can be open.
  return row.type === 'sleep';
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

export function describeEvent(row: EventRow): string {
  if (row.type === 'feed') {
    const feed = parseFeed(row.details);
    if (!feed) return 'Feed';
    return feedLabel(feed);
  }
  if (row.type === 'diaper') {
    const diaper = parseDiaper(row.details);
    if (!diaper) return 'Diaper';
    return `Diaper · ${diaper.wet && diaper.dirty ? 'wet and dirty' : diaper.wet ? 'wet' : 'dirty'}`;
  }
  if (row.type === 'sleep') {
    return row.ended_at
      ? `Sleep · ${formatDuration(new Date(row.ended_at).getTime() - new Date(row.started_at).getTime())}`
      : 'Sleep · ongoing';
  }
  return 'Event';
}
