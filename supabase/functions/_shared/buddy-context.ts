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
export const HISTORY_LIMIT = 30;
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

/** A chat_messages row as read for history or the summary (no author, no ids). */
export type StoredMessage = {
  role: "user" | "assistant";
  content: string | null;
  escalation: "health" | "urgent" | null;
  proposal_summary: string | null;
  /** A parent message whose turn escalated (health). */
  gated: boolean;
};

export type HistoryMessage = { role: "user" | "assistant"; content: string };

/** Gated questions and escalation replies never reach the model again. */
export function usable(row: StoredMessage): boolean {
  return !row.gated && row.escalation === null;
}

/** A message as plain text for the model: content, plus the proposal summary on replies. */
export function messageText(row: StoredMessage): string {
  return [row.content, row.role === "assistant" ? row.proposal_summary : null]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join("\n")
    .slice(0, MAX_HISTORY_CHARS);
}

/**
 * The thread's recent turns for the model, oldest first, at most HISTORY_LIMIT.
 * The query already skips gated and escalation rows; they are filtered here too,
 * so an earlier health question can't be answered later.
 */
export function buildHistory(rows: StoredMessage[]): HistoryMessage[] {
  const keep: HistoryMessage[] = [];
  for (const row of rows) {
    if (!usable(row)) continue;
    const text = messageText(row);
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
