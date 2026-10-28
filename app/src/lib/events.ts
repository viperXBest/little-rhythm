import { randomUUID } from 'expo-crypto';

import type { Json, Tables } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

export type EventRow = Tables<'events'>;
export type EventType = 'feed' | 'sleep' | 'diaper';
export type BreastSide = 'left' | 'right';

export type FeedDetails =
  | { kind: 'bottle'; ml: number }
  | { kind: 'breast'; side: BreastSide; minutes: number };
export type DiaperDetails = { wet: boolean; dirty: boolean };

/** Columns members may change after insert (the DB grants update on these only). */
export type EventPatch = Partial<Pick<EventRow, 'started_at' | 'ended_at' | 'details'>>;

export const ML_RANGE = { min: 5, max: 400 } as const;
export const MINUTES_RANGE = { min: 1, max: 90 } as const;

function isObject(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inRange(value: unknown, range: { min: number; max: number }): value is number {
  return Number.isInteger(value) && (value as number) >= range.min && (value as number) <= range.max;
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
}): EventRow {
  return {
    id: randomUUID(),
    baby_id: input.babyId,
    type: input.type,
    started_at: input.startedAt.toISOString(),
    ended_at: input.endedAt ? input.endedAt.toISOString() : null,
    details: input.details ?? {},
    created_by: input.userId,
    source: 'tap',
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
    return feed.kind === 'bottle'
      ? `Bottle · ${feed.ml} ml`
      : `Breast · ${feed.side} · ${feed.minutes} min`;
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
