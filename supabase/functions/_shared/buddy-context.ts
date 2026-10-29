// What the buddy knows each turn, built by the server. Only the baby's age in
// weeks, the last 48 h of events (type, local times, details) and the
// computed windows. No names, ids or authors, and no couple data (night-feed
// balance stays out of the model). Thread history comes in as plain
// user/assistant turns with escalated turns removed.

import type { Proposal } from "./agent-schemas.ts";
import { describeWindows, type EventSummary } from "./agent.ts";
import type { Prediction } from "./predict.ts";
import { toZoneLocalTime, type Zone } from "./zone.ts";

export const CONTEXT_HOURS = 48;
export const MAX_CONTEXT_EVENTS = 150;
export const HISTORY_LIMIT = 10;
const MAX_HISTORY_CHARS = 1000;

export type BuddyContext = {
  age_weeks: number;
  /** Oldest first, local wall-clock times. */
  events: Record<string, unknown>[];
  next_windows: Record<string, unknown>;
};

export function buildContext(input: {
  ageWeeks: number;
  events: EventSummary[];
  prediction: Prediction;
  zone: Zone;
}): BuddyContext {
  const events = input.events
    .slice(-MAX_CONTEXT_EVENTS)
    .map((e) => ({
      type: e.type,
      start: toZoneLocalTime(e.started_at, input.zone),
      ...(e.type === "sleep"
        ? { end: e.ended_at ? toZoneLocalTime(e.ended_at, input.zone) : "in progress" }
        : {}),
      ...e.details,
    }));
  return {
    age_weeks: input.ageWeeks,
    events,
    next_windows: describeWindows(input.prediction, input.zone),
  };
}

/** A chat_messages row as read for history (no author, no ids). */
export type StoredMessage = {
  role: "user" | "assistant";
  content: string | null;
  escalation: "health" | "urgent" | null;
  proposal_summary: string | null;
};

export type HistoryMessage = { role: "user" | "assistant"; content: string };

/**
 * The thread's recent turns for the model, oldest first, at most HISTORY_LIMIT.
 * An escalated turn (the escalation row and the user message just before it)
 * is dropped, so an earlier health question can't be answered later.
 */
export function buildHistory(rows: StoredMessage[]): HistoryMessage[] {
  const keep: HistoryMessage[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const next = rows[i + 1];
    if (row.escalation !== null) continue;
    if (row.role === "user" && next?.role === "assistant" && next.escalation !== null) continue;
    const text = [row.content, row.role === "assistant" ? row.proposal_summary : null]
      .filter((part): part is string => !!part && part.trim().length > 0)
      .join("\n")
      .slice(0, MAX_HISTORY_CHARS);
    if (text) keep.push({ role: row.role, content: text });
  }
  return keep.slice(-HISTORY_LIMIT);
}

/**
 * One line for the stored assistant message, built from the validated
 * proposals (never by the model): "Proposed: bottle 90 ml at 15:00; sleep from 15:40".
 */
export function proposalSummary(proposals: Proposal[], zone: Zone): string | null {
  const time = (iso: string | null) => (iso ? toZoneLocalTime(iso, zone).slice(11, 16) : "?");
  const parts = proposals.map((p) => {
    switch (p.type) {
      case "feed": {
        const d = p.details;
        const what = d.kind === "bottle"
          ? `bottle${d.ml ? ` ${d.ml} ml` : ""}`
          : `breast${d.side ? ` ${d.side}` : ""}${d.minutes ? ` ${d.minutes} min` : ""}`;
        return `${what} at ${time(p.started_at)}`;
      }
      case "sleep":
        return p.ended_at
          ? `sleep ${time(p.started_at)}–${time(p.ended_at)}`
          : `sleep from ${time(p.started_at)}`;
      case "sleep_end":
        return `woke at ${time(p.ended_at)}`;
      case "diaper": {
        const kind = [p.details.wet ? "wet" : null, p.details.dirty ? "dirty" : null].filter(Boolean).join(
          " and ",
        );
        return `${kind || ""} diaper at ${time(p.started_at)}`.trim();
      }
    }
  });
  if (parts.length === 0) return null;
  return `Proposed: ${parts.join("; ")}`.slice(0, 500);
}
