// Data the chat function reads, always through the caller's own client so RLS
// scopes every query to their family. The baby comes from the session; the
// model and the request body never name one.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

import type { OpenSleep, RecentEventsQuery } from "./agent-schemas.ts";
import type { EventSummary } from "./agent.ts";

const MAX_EVENTS = 50;

export type SessionBaby = { id: string; birth_date: string };
export type BabyResult =
  | { ok: true; baby: SessionBaby }
  | { ok: false; error: "not_in_family" | "multiple_babies" | "failed" };

/** The caller's baby. Exactly one row or an error: never "the first one". */
export async function resolveBaby(db: SupabaseClient): Promise<BabyResult> {
  const { data, error } = await db.from("babies").select("id, birth_date").limit(2);
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
