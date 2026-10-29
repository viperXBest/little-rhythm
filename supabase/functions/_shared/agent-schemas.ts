// Tool arguments from Muse Spark are untrusted input. Every write tool call
// becomes a Proposal: the fields that passed validation plus one error per
// field that did not. Invalid calls are never dropped; the parent fixes them on
// the confirm card. Nothing here touches the database.
//
// baby_id and family_id are not tool arguments. Unknown keys (an injected
// baby_id, say) are ignored: only the fields below are ever read.

import { z } from "npm:zod@4.6.6";

// Must match ML_RANGE and MINUTES_RANGE in app/src/lib/events.ts.
export const FEED_ML = { min: 5, max: 400 } as const;
export const FEED_MINUTES = { min: 1, max: 90 } as const;

/** Phone and server clocks drift; "just now" may land a little ahead. */
export const FUTURE_SKEW_MS = 2 * 60_000;
export const MAX_AGE_MS = 48 * 3_600_000;
export const TZ_OFFSET = { min: -840, max: 840 } as const;

const Timestamp = z.string().min(1).max(40);

const FeedFields = {
  kind: z.enum(["bottle", "breast"]),
  started_at: Timestamp,
  ml: z.int().min(FEED_ML.min).max(FEED_ML.max).optional(),
  side: z.enum(["left", "right"]).optional(),
  minutes: z.int().min(FEED_MINUTES.min).max(FEED_MINUTES.max).optional(),
};
const DiaperFields = {
  started_at: Timestamp,
  wet: z.boolean().optional(),
  dirty: z.boolean().optional(),
};

export const RecentEventsArgs = z.object({
  hours: z.int().min(1).max(48).optional(),
  type: z.enum(["feed", "sleep", "diaper"]).optional(),
});
export type RecentEventsQuery = z.infer<typeof RecentEventsArgs>;

export const WRITE_TOOLS = ["log_feed", "log_sleep", "end_sleep", "log_diaper"] as const;
export type WriteTool = (typeof WRITE_TOOLS)[number];

export function isWriteTool(name: string): name is WriteTool {
  return (WRITE_TOOLS as readonly string[]).includes(name);
}

export type ProposalErrorCode =
  | "invalid_arguments"
  | "required"
  | "invalid"
  | "out_of_range"
  | "invalid_time"
  | "in_future"
  | "too_old"
  | "before_start"
  | "wet_or_dirty"
  | "no_open_sleep"
  | "sleep_already_open";

export type ProposalError = { field: string; code: ProposalErrorCode };

export type FeedProposal = {
  id: string;
  type: "feed";
  started_at: string | null;
  details: {
    kind?: "bottle" | "breast";
    ml?: number;
    side?: "left" | "right";
    minutes?: number;
  };
  errors: ProposalError[];
};
export type SleepProposal = {
  id: string;
  type: "sleep";
  started_at: string | null;
  ended_at: string | null;
  errors: ProposalError[];
};
/** Closes the session baby's open sleep; sleep_id comes from the server, never the model. */
export type SleepEndProposal = {
  id: string;
  type: "sleep_end";
  sleep_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  errors: ProposalError[];
};
export type DiaperProposal = {
  id: string;
  type: "diaper";
  started_at: string | null;
  details: { wet?: boolean; dirty?: boolean };
  errors: ProposalError[];
};
export type Proposal = FeedProposal | SleepProposal | SleepEndProposal | DiaperProposal;

export type OpenSleep = { id: string; started_at: string };

export type ProposalContext = {
  now: Date;
  /** Minutes east of UTC on the parent's phone (Bucharest summer: 180). */
  offsetMinutes: number;
  openSleep: OpenSleep | null;
};

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export type TimeResult = { ok: true; iso: string } | { ok: false; code: ProposalErrorCode };

const TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Parses an ISO 8601 time. Without a zone it is the parent's wall clock
 * (offsetMinutes). Rejects times in the future (beyond a small skew) and older
 * than 48 h. Returns UTC ISO.
 */
export function resolveTimestamp(input: string, ctx: ProposalContext): TimeResult {
  const match = TIME_PATTERN.exec(input.trim());
  if (!match) return { ok: false, code: "invalid_time" };
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map((v) => Number(v ?? 0));
  const zone = match[7];
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(wall);
  // Rejects 2026-02-30, 25:00 and the like instead of rolling over.
  if (
    check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day ||
    check.getUTCHours() !== hour || check.getUTCMinutes() !== minute
  ) {
    return { ok: false, code: "invalid_time" };
  }
  const offset = zone === undefined ? ctx.offsetMinutes : zoneMinutes(zone);
  if (offset === null) return { ok: false, code: "invalid_time" };
  const ms = wall - offset * 60_000;
  const now = ctx.now.getTime();
  if (ms > now + FUTURE_SKEW_MS) return { ok: false, code: "in_future" };
  if (ms < now - MAX_AGE_MS) return { ok: false, code: "too_old" };
  return { ok: true, iso: new Date(ms).toISOString() };
}

function zoneMinutes(zone: string): number | null {
  if (zone === "Z") return 0;
  const digits = zone.slice(1).replace(":", "");
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2));
  if (hours > 14 || minutes > 59) return null;
  return (zone[0] === "-" ? -1 : 1) * (hours * 60 + minutes);
}

/** Wall-clock time on the parent's phone, for the model: "2026-10-28T16:53". */
export function toLocalTime(iso: string | Date, offsetMinutes: number): string {
  const ms = (typeof iso === "string" ? Date.parse(iso) : iso.getTime()) + offsetMinutes * 60_000;
  return new Date(ms).toISOString().slice(0, 16);
}

// ---------------------------------------------------------------------------
// Proposals
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;

class Collector {
  readonly errors: ProposalError[] = [];

  constructor(private readonly raw: Raw) {}

  /** Validates one field with its schema; null and absent count as missing. */
  field<S extends z.ZodType>(key: string, schema: S, required: boolean): z.output<S> | undefined {
    const value = this.raw[key];
    if (value === undefined || value === null) {
      if (required) this.add(key, "required");
      return undefined;
    }
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    this.add(key, issue?.code === "too_big" || issue?.code === "too_small" ? "out_of_range" : "invalid");
    return undefined;
  }

  time(key: string, required: boolean, ctx: ProposalContext): string | null {
    const value = this.field(key, Timestamp, required);
    if (value === undefined) return null;
    const result = resolveTimestamp(value, ctx);
    if (result.ok) return result.iso;
    this.add(key, result.code);
    return null;
  }

  add(field: string, code: ProposalErrorCode): void {
    if (!this.errors.some((e) => e.field === field)) this.errors.push({ field, code });
  }
}

function parseArgs(rawArgs: string): Raw | null {
  try {
    const value: unknown = JSON.parse(rawArgs);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Raw : null;
  } catch {
    return null;
  }
}

/** Turns one write tool call into a proposal. Always returns one, with errors if invalid. */
export function toProposal(
  tool: WriteTool,
  rawArgs: string,
  ctx: ProposalContext,
  id: string = crypto.randomUUID(),
): Proposal {
  const raw = parseArgs(rawArgs);
  const c = new Collector(raw ?? {});
  if (!raw) c.add("arguments", "invalid_arguments");

  switch (tool) {
    case "log_feed": {
      const kind = c.field("kind", FeedFields.kind, true);
      const started_at = c.time("started_at", true, ctx);
      const ml = c.field("ml", FeedFields.ml, kind === "bottle");
      const side = c.field("side", FeedFields.side, kind === "breast");
      const minutes = c.field("minutes", FeedFields.minutes, kind === "breast");
      const details: FeedProposal["details"] = kind === "bottle"
        ? { kind, ml }
        : kind === "breast"
        ? { kind, side, minutes }
        : { ml, side, minutes };
      return { id, type: "feed", started_at, details: dropUndefined(details), errors: c.errors };
    }
    case "log_sleep": {
      const started_at = c.time("started_at", true, ctx);
      const ended_at = c.time("ended_at", false, ctx);
      if (started_at && ended_at && ended_at < started_at) c.add("ended_at", "before_start");
      const rawEnd = raw?.ended_at;
      if ((rawEnd === undefined || rawEnd === null) && ctx.openSleep) c.add("ended_at", "sleep_already_open");
      return { id, type: "sleep", started_at, ended_at, errors: c.errors };
    }
    case "end_sleep": {
      const ended_at = c.time("ended_at", true, ctx);
      const open = ctx.openSleep;
      if (!open) c.add("sleep", "no_open_sleep");
      else if (ended_at && Date.parse(ended_at) < Date.parse(open.started_at)) {
        c.add("ended_at", "before_start");
      }
      return {
        id,
        type: "sleep_end",
        sleep_id: open?.id ?? null,
        started_at: open ? new Date(open.started_at).toISOString() : null,
        ended_at,
        errors: c.errors,
      };
    }
    case "log_diaper": {
      const started_at = c.time("started_at", true, ctx);
      const wet = c.field("wet", DiaperFields.wet, false);
      const dirty = c.field("dirty", DiaperFields.dirty, false);
      if (!wet && !dirty) c.add("details", "wet_or_dirty");
      return {
        id,
        type: "diaper",
        started_at,
        details: { wet: wet ?? false, dirty: dirty ?? false },
        errors: c.errors,
      };
    }
  }
}

function dropUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

// ---------------------------------------------------------------------------
// Tool definitions sent to the model (OpenAI function-calling format)
// ---------------------------------------------------------------------------

const TIME_HINT = "Parent's local wall-clock time, YYYY-MM-DDTHH:mm. Never in the future.";

export type ToolDefinition = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "log_feed",
      description:
        "Propose one feed. Bottle: ml. Breast: side and minutes (one call per side). The parent confirms before anything is saved.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "started_at"],
        properties: {
          kind: { type: "string", enum: ["bottle", "breast"] },
          started_at: { type: "string", description: TIME_HINT },
          ml: { type: "integer", minimum: FEED_ML.min, maximum: FEED_ML.max },
          side: { type: "string", enum: ["left", "right"] },
          minutes: { type: "integer", minimum: FEED_MINUTES.min, maximum: FEED_MINUTES.max },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_sleep",
      description:
        "Propose a sleep that starts at started_at. Omit ended_at if the baby is still asleep. Do not use this to end the current sleep; use end_sleep.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["started_at"],
        properties: {
          started_at: { type: "string", description: TIME_HINT },
          ended_at: { type: "string", description: TIME_HINT },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "end_sleep",
      description: "Propose ending the sleep that is in progress (the baby woke up).",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["ended_at"],
        properties: { ended_at: { type: "string", description: TIME_HINT } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_diaper",
      description: "Propose one diaper change. Set wet and/or dirty.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["started_at", "wet", "dirty"],
        properties: {
          started_at: { type: "string", description: TIME_HINT },
          wet: { type: "boolean" },
          dirty: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_next_windows",
      description:
        "Get the computed next feed, next nap (or expected wake while asleep), bedtime-routine start and bedtime windows for the baby. Times come from code, based on the last 7 days or typical ranges for the age.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_events",
      description: "Read the baby's logged events from the last hours (default 24), newest first.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          hours: { type: "integer", minimum: 1, maximum: 48 },
          type: { type: "string", enum: ["feed", "sleep", "diaper"] },
        },
      },
    },
  },
];
