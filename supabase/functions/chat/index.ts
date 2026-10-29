// Agentic logging: text or a voice clip in, proposals out.
// POST application/json        { text, tz_offset_minutes, tz? }
// POST multipart/form-data      audio (16 kHz mono PCM16 WAV), tz_offset_minutes, tz?
//   -> { transcript?, caption, proposals, source: "chat" | "voice" }
// Nothing is saved here: the app shows each proposal as a confirm card and
// inserts it with the parent's own session (RLS). The baby comes from the
// session, never from the body or the model. Text, transcripts, audio and
// tool arguments are never logged.

import { runAgent } from "../_shared/agent.ts";
import {
  ageInWeeks,
  readOpenSleep,
  readPredictionEvents,
  readRecentEvents,
  resolveBaby,
} from "../_shared/chat-data.ts";
import { MuseError, sparkComplete, transcribe } from "../_shared/muse.ts";
import { predict } from "../_shared/predict.ts";
import { parseZone } from "../_shared/zone.ts";
import { adminClient, getCaller, json, userClient } from "../_shared/supabase.ts";
import { checkHeaders, parseChatRequest } from "./request.ts";

const LIMIT = { fn: "chat", windowSeconds: 3600, max: 60 } as const;
// Chosen from the Day 4 latency test (see docs/chat.md).
const REASONING_EFFORT = "low" as const;
const KNOWN_FAILURES = new Set(["open_sleep_failed", "recent_events_failed", "week_events_failed"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const apiKey = Deno.env.get("MODEL_API_KEY");
  if (!apiKey) {
    console.error("chat: MODEL_API_KEY missing");
    return json({ error: "server_misconfigured" }, 500);
  }

  const admin = adminClient();
  const user = await getCaller(req, admin);
  if (!user) return json({ error: "unauthorized" }, 401);

  const headerError = checkHeaders(req);
  if (headerError && !headerError.ok) return json({ error: headerError.error }, headerError.status);

  const { data: allowed, error: limitError } = await admin.rpc("consume_rate_limit", {
    p_user_id: user.id,
    p_function: LIMIT.fn,
    p_window_seconds: LIMIT.windowSeconds,
    p_max: LIMIT.max,
  });
  if (limitError) {
    console.error("chat: rate limit failed", limitError.code);
    return json({ error: "internal_error" }, 500);
  }
  if (allowed !== true) return json({ error: "rate_limited" }, 429);

  // Every read from here on runs as the caller, so RLS scopes it to their family.
  const db = userClient(req);
  const baby = await resolveBaby(db);
  if (!baby.ok) {
    if (baby.error === "failed") {
      console.error("chat: baby lookup failed");
      return json({ error: "internal_error" }, 500);
    }
    return json({ error: baby.error }, 409);
  }

  const request = await parseChatRequest(req);
  if (!request.ok) return json({ error: request.error }, request.status);

  let text: string;
  let transcript: string | undefined;
  if (request.kind === "voice") {
    try {
      transcript = await transcribe(request.wav, apiKey);
    } catch (error) {
      return museFailure(error);
    }
    if (!transcript) return json({ error: "no_speech" }, 422);
    text = transcript.slice(0, 1000);
  } else {
    text = request.text;
  }

  const now = new Date();
  const babyId = baby.baby.id;
  const birthDate = baby.baby.birth_date;
  // The offset was validated, so a zone always resolves; same engine as predict.
  const zone = parseZone(request.tz, request.offsetMinutes) ??
    { kind: "offset", minutes: request.offsetMinutes };
  try {
    const openSleep = await readOpenSleep(db, babyId);
    const result = await runAgent({
      text,
      now,
      offsetMinutes: request.offsetMinutes,
      ageWeeks: ageInWeeks(baby.baby.birth_date, now, request.offsetMinutes),
      openSleep,
      complete: sparkComplete(apiKey, REASONING_EFFORT),
      recentEvents: (query) => readRecentEvents(db, babyId, query, now),
      nextWindows: async () =>
        predict({ now, zone, birthDate, events: await readPredictionEvents(db, babyId, now) }),
      zone,
    });
    return json({
      ...(transcript !== undefined ? { transcript } : {}),
      caption: result.caption,
      proposals: result.proposals,
      source: request.kind === "voice" ? "voice" : "chat",
    });
  } catch (error) {
    return museFailure(error);
  }
});

function museFailure(error: unknown): Response {
  if (error instanceof MuseError) {
    console.error(`chat: ${error.code}`, error.status ?? "no_status");
    return json({ error: error.code }, 502);
  }
  // Our own errors carry a code as their message; anything else may echo input.
  const code = error instanceof Error && KNOWN_FAILURES.has(error.message) ? error.message : "unexpected";
  console.error("chat: failed", code);
  return json({ error: "internal_error" }, 500);
}
