// Data the chat function reads, always through the caller's own client so RLS
// scopes every query to their family. The baby comes from the session; the
// model and the request body never name one.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

import type { OpenSleep, RecentEventsQuery } from "./agent-schemas.ts";
import type { EventSummary } from "./agent.ts";
import { CONTEXT_HOURS, HISTORY_LIMIT, MAX_CONTEXT_EVENTS, type StoredMessage } from "./buddy-context.ts";
import type { PredictEvent } from "./predict.ts";
import { HISTORY_DAYS } from "./predict-constants.ts";

const MAX_EVENTS = 50;
/** 7 days at a busy newborn pace is ~250 rows. */
const MAX_WEEK_EVENTS = 500;

export type SessionBaby = { id: string; birth_date: string; family_id: string };
export type BabyResult =
  | { ok: true; baby: SessionBaby }
  | { ok: false; error: "not_in_family" | "multiple_babies" | "failed" };

/** The caller's baby. Exactly one row or an error: never "the first one". */
export async function resolveBaby(db: SupabaseClient): Promise<BabyResult> {
  const { data, error } = await db.from("babies").select("id, birth_date, family_id").limit(2);
  if (error) return { ok: false, error: "failed" };
  const rows = (data ?? []) as SessionBaby[];
  if (rows.length === 0) return { ok: false, error: "not_in_family" };
  if (rows.length > 1) return { ok: false, error: "multiple_babies" };
  return { ok: true, baby: rows[0] };
}

export async function readOpenSleep(db: SupabaseClient, babyId: string): Promise<OpenSleep | null> {
  const { data, error } = await db
    .from("events")
    .select("id, started_at")
    .eq("baby_id", babyId)
    .eq("type", "sleep")
    .is("ended_at", null)
    .maybeSingle();
  if (error) throw new Error("open_sleep_failed");
  return (data as OpenSleep | null) ?? null;
}

export async function readRecentEvents(
  db: SupabaseClient,
  babyId: string,
  query: RecentEventsQuery,
  now: Date,
): Promise<EventSummary[]> {
  const since = new Date(now.getTime() - (query.hours ?? 24) * 3_600_000).toISOString();
  let request = db
    .from("events")
    .select("type, started_at, ended_at, details")
    .eq("baby_id", babyId)
    .gte("started_at", since);
  if (query.type) request = request.eq("type", query.type);
  const { data, error } = await request.order("started_at", { ascending: false }).limit(MAX_EVENTS);
  if (error) throw new Error("recent_events_failed");
  return ((data ?? []) as EventSummary[]).map((row) => ({
    type: row.type,
    started_at: row.started_at,
    ended_at: row.ended_at,
    details: pickDetails(row.details),
  }));
}

/** The last 48 h of the session baby's events, oldest first, for the buddy context. */
export async function readContextEvents(
  db: SupabaseClient,
  babyId: string,
  now: Date,
): Promise<EventSummary[]> {
  const since = new Date(now.getTime() - CONTEXT_HOURS * 3_600_000).toISOString();
  const { data, error } = await db
    .from("events")
    .select("type, started_at, ended_at, details")
    .eq("baby_id", babyId)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(MAX_CONTEXT_EVENTS);
  if (error) throw new Error("context_events_failed");
  return ((data ?? []) as EventSummary[]).reverse().map((row) => ({
    type: row.type,
    started_at: row.started_at,
    ended_at: row.ended_at,
    details: pickDetails(row.details),
  }));
}

export type ThreadCheck = { ok: true } | { ok: false; error: "thread_not_found" | "failed" };

/**
 * The thread belongs to the caller: in their family, and shared or their own
 * private one. Read with the service role and checked here explicitly, because
 * the assistant reply is written with the service role. "Not found" and "not
 * yours" are the same answer.
 */
export async function checkThread(
  admin: SupabaseClient,
  threadId: string,
  caller: { userId: string; familyId: string },
): Promise<ThreadCheck> {
  const { data, error } = await admin
    .from("chat_threads")
    .select("family_id, owner_id")
    .eq("id", threadId)
    .maybeSingle();
  if (error) return { ok: false, error: "failed" };
  const thread = data as { family_id: string; owner_id: string | null } | null;
  if (!thread || thread.family_id !== caller.familyId) return { ok: false, error: "thread_not_found" };
  if (thread.owner_id !== null && thread.owner_id !== caller.userId) {
    return { ok: false, error: "thread_not_found" };
  }
  return { ok: true };
}

/** The thread's latest messages, oldest first, read as the caller (RLS). No authors or ids. */
export async function readThreadHistory(db: SupabaseClient, threadId: string): Promise<StoredMessage[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("role, content, escalation, proposal_summary")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT * 2);
  if (error) throw new Error("history_failed");
  return ((data ?? []) as StoredMessage[]).reverse();
}

/** The last 7 days of the session baby's events, oldest first, for the prediction engine. */
export async function readWeekEvents(db: SupabaseClient, babyId: string, now: Date): Promise<PredictEvent[]> {
  const since = new Date(now.getTime() - HISTORY_DAYS * 86_400_000).toISOString();
  const { data, error } = await db
    .from("events")
    .select("type, started_at, ended_at")
    .eq("baby_id", babyId)
    .gte("started_at", since)
    .order("started_at", { ascending: true })
    .limit(MAX_WEEK_EVENTS);
  if (error) throw new Error("week_events_failed");
  return (data ?? []) as PredictEvent[];
}

/**
 * The engine's input for the session baby: 7 days of events plus the open
 * sleep, which may have started before the window.
 */
export async function readPredictionEvents(
  db: SupabaseClient,
  babyId: string,
  now: Date,
): Promise<PredictEvent[]> {
  const [events, open] = await Promise.all([readWeekEvents(db, babyId, now), readOpenSleep(db, babyId)]);
  if (open && !events.some((e) => e.type === "sleep" && e.ended_at === null)) {
    events.unshift({ type: "sleep", started_at: open.started_at, ended_at: null });
  }
  return events;
}

// Only the fields the app writes; anything else in the jsonb stays out of the prompt.
const DETAIL_KEYS = ["kind", "ml", "side", "minutes", "wet", "dirty"] as const;

function pickDetails(details: unknown): Record<string, unknown> {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  const source = details as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of DETAIL_KEYS) {
    const value = source[key];
    if (typeof value === "number" || typeof value === "boolean") out[key] = value;
    else if (typeof value === "string" && value.length <= 10) out[key] = value;
  }
  return out;
}

/** Whole weeks since birth, by the parent's local calendar day. */
export function ageInWeeks(birthDate: string, now: Date, offsetMinutes: number): number {
  const today = new Date(now.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
  const days = Math.floor((Date.parse(today) - Date.parse(birthDate)) / 86_400_000);
  return Math.max(0, Math.floor(days / 7));
}
