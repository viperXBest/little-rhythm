// Data the chat function reads, always through the caller's own client so RLS
// scopes every query to their family. The baby comes from the session; the
// model and the request body never name one.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

import {
  type OpenSleep,
  type RecentEventsQuery,
  SEARCH_LIMIT,
  type SearchHistoryQuery,
} from "./agent-schemas.ts";
import type { EventSummary, FoundMessage } from "./agent.ts";
import { CONTEXT_HOURS, HISTORY_LIMIT, MAX_CONTEXT_EVENTS, type StoredMessage } from "./buddy-context.ts";
import type { NightFeedRow } from "./night-feeds.ts";
import type { PredictEvent } from "./predict.ts";
import type { FoldMessage, MemoryRow } from "./thread-memory.ts";
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

/**
 * The thread's latest usable messages, oldest first, read as the caller (RLS).
 * Gated questions and escalation replies are skipped in the query. No authors or ids.
 */
export async function readThreadHistory(db: SupabaseClient, threadId: string): Promise<StoredMessage[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("role, content, escalation, proposal_summary, gated")
    .eq("thread_id", threadId)
    .eq("gated", false)
    .is("escalation", null)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error("history_failed");
  return ((data ?? []) as StoredMessage[]).reverse();
}

/**
 * Full-text search in one thread through search_thread_messages() (SECURITY
 * INVOKER, so the caller's RLS applies). The thread is the session's, never the
 * model's; gated and escalation rows are excluded in SQL.
 */
export async function searchThread(
  db: SupabaseClient,
  threadId: string,
  query: SearchHistoryQuery,
): Promise<FoundMessage[]> {
  const { data, error } = await db.rpc("search_thread_messages", {
    p_thread_id: threadId,
    p_query: query.query,
    p_limit: query.limit ?? SEARCH_LIMIT.default,
  });
  if (error) throw new Error("search_failed");
  return ((data ?? []) as FoundMessage[]).filter((m) => typeof m.content === "string");
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

/** The session baby's feeds since `since`, with who logged them, for the night-feed balance. */
export async function readNightFeeds(
  db: SupabaseClient,
  babyId: string,
  since: Date,
): Promise<NightFeedRow[]> {
  const { data, error } = await db
    .from("events")
    .select("started_at, created_by")
    .eq("baby_id", babyId)
    .eq("type", "feed")
    .gte("started_at", since.toISOString())
    .order("started_at", { ascending: false })
    .limit(MAX_WEEK_EVENTS);
  if (error) throw new Error("night_feeds_failed");
  return (data ?? []) as NightFeedRow[];
}

/** The caller's co-parent, read through RLS (family members only), or null. */
export async function readPartnerId(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db.from("family_members").select("user_id").neq("user_id", userId).limit(1);
  if (error) throw new Error("partner_failed");
  const rows = (data ?? []) as { user_id: string }[];
  return rows[0]?.user_id ?? null;
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

// ---------------------------------------------------------------------------
// Thread memory
// ---------------------------------------------------------------------------

/** The thread's summary, read as the caller (RLS: visible exactly when the thread is). */
export async function readThreadMemory(db: SupabaseClient, threadId: string): Promise<MemoryRow | null> {
  const { data, error } = await db
    .from("thread_memory")
    .select("summary, covered_until")
    .eq("thread_id", threadId)
    .maybeSingle();
  if (error) throw new Error("memory_failed");
  return (data as MemoryRow | null) ?? null;
}

/** Usable messages after `since`, oldest first, for folding into the summary (caller's JWT). */
export async function readFoldMessages(
  db: SupabaseClient,
  threadId: string,
  since: string | null,
  cap: number,
): Promise<FoldMessage[]> {
  let request = db
    .from("chat_messages")
    .select("role, content, escalation, proposal_summary, gated, created_at")
    .eq("thread_id", threadId)
    .eq("gated", false)
    .is("escalation", null);
  if (since) request = request.gt("created_at", since);
  const { data, error } = await request.order("created_at", { ascending: true }).limit(cap);
  if (error) throw new Error("fold_read_failed");
  return (data ?? []) as FoldMessage[];
}

/** The baby's and the parents' names (RLS), only to keep them out of the summary. */
export async function readFamilyNames(db: SupabaseClient): Promise<string[]> {
  const [baby, profiles] = await Promise.all([
    db.from("babies").select("name"),
    db.from("profiles").select("display_name"),
  ]);
  if (baby.error || profiles.error) throw new Error("names_failed");
  return [
    ...((baby.data ?? []) as { name: string }[]).map((r) => r.name),
    ...((profiles.data ?? []) as { display_name: string }[]).map((r) => r.display_name),
  ].filter((n) => typeof n === "string" && n.trim().length > 0);
}

/**
 * Stores the summary with the service role. Optimistic: the first fold inserts;
 * later folds update only if covered_until is still what they read, so when both
 * parents' turns fold at once, one wins and the other changes nothing.
 */
export async function writeThreadMemory(
  admin: SupabaseClient,
  threadId: string,
  next: MemoryRow,
  previous: MemoryRow | null,
): Promise<void> {
  const row = {
    summary: next.summary,
    covered_until: next.covered_until,
    updated_at: new Date().toISOString(),
  };
  const { error } = previous
    ? await admin
      .from("thread_memory")
      .update(row)
      .eq("thread_id", threadId)
      .eq("covered_until", previous.covered_until)
    : await admin
      .from("thread_memory")
      .upsert({ thread_id: threadId, ...row }, { onConflict: "thread_id", ignoreDuplicates: true });
  if (error) throw new Error("memory_write_failed");
}
