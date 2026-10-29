// Agentic logging and the buddy: text or a voice clip in, a reply and proposals out.
// POST application/json        { text, thread_id, tz_offset_minutes, tz? }
// POST multipart/form-data      audio (16 kHz mono PCM16 WAV), thread_id, tz_offset_minutes, tz?
//   -> { transcript?, caption, escalation, proposals, source: "chat" | "voice", thread_id }
// No event is saved here: the app shows each proposal as a confirm card and
// inserts it with the parent's own session (RLS). The baby comes from the
// session, never from the body or the model.
//
// Every turn passes the health gate (_shared/health-gate.ts): a keyword check
// and a Muse classifier running beside the agent. A positive turn returns an
// escalation with no model text; the app shows a static card.
//
// The turn is stored in the thread: the parent's message (text or transcript,
// never audio) with the caller's JWT, then the assistant's (caption or
// escalation flag, plus a server-built proposal summary) with the service role,
// only after the thread was checked to be the caller's. Text, transcripts,
// audio and tool arguments are never logged.

import { runAgent } from "../_shared/agent.ts";
import { buildContext, buildHistory, proposalSummary } from "../_shared/buddy-context.ts";
import {
  ageInWeeks,
  checkThread,
  readContextEvents,
  readOpenSleep,
  readPredictionEvents,
  readRecentEvents,
  readThreadHistory,
  resolveBaby,
} from "../_shared/chat-data.ts";
import {
  applyHealthGate,
  CLASSIFIER_SCHEMA,
  classifyHealth,
  type Escalation,
} from "../_shared/health-gate.ts";
import { keywordHit } from "../_shared/health-keywords.ts";
import { MuseError, sparkComplete, sparkJson, transcribe } from "../_shared/muse.ts";
import { predict } from "../_shared/predict.ts";
import { parseZone } from "../_shared/zone.ts";
import { adminClient, getCaller, json, userClient } from "../_shared/supabase.ts";
import { checkHeaders, parseChatRequest } from "./request.ts";

const LIMIT = { fn: "chat", windowSeconds: 3600, max: 60 } as const;
// Chosen from the Day 4 latency test (see docs/chat.md).
const REASONING_EFFORT = "low" as const;
const KNOWN_FAILURES = new Set([
  "open_sleep_failed",
  "recent_events_failed",
  "week_events_failed",
  "context_events_failed",
  "history_failed",
  "message_insert_failed",
]);

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

  // Before transcribing or storing anything: the thread is the caller's.
  const thread = await checkThread(admin, request.threadId, {
    userId: user.id,
    familyId: baby.baby.family_id,
  });
  if (!thread.ok) {
    if (thread.error === "failed") {
      console.error("chat: thread lookup failed");
      return json({ error: "internal_error" }, 500);
    }
    return json({ error: "thread_not_found" }, 404);
  }

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
  const threadId = request.threadId;
  const source = request.kind === "voice" ? "voice" : "chat";
  // The offset was validated, so a zone always resolves; same engine as predict.
  const zone = parseZone(request.tz, request.offsetMinutes) ??
    { kind: "offset", minutes: request.offsetMinutes };
  const ageWeeks = ageInWeeks(birthDate, now, request.offsetMinutes);

  try {
    const [openSleep, contextEvents, predictionEvents, historyRows] = await Promise.all([
      readOpenSleep(db, babyId),
      readContextEvents(db, babyId, now),
      readPredictionEvents(db, babyId, now),
      readThreadHistory(db, threadId),
    ]);
    const prediction = predict({ now, zone, birthDate, events: predictionEvents });

    // The parent's message, as the caller: RLS allows only role 'user' by them.
    const stored = await db
      .from("chat_messages")
      .insert({ thread_id: threadId, role: "user", content: text, author_id: user.id });
    if (stored.error) throw new Error("message_insert_failed");

    const keyword = keywordHit(text);
    const [agent, classifier] = await Promise.allSettled([
      runAgent({
        text,
        now,
        offsetMinutes: request.offsetMinutes,
        ageWeeks,
        openSleep,
        complete: sparkComplete(apiKey, REASONING_EFFORT),
        recentEvents: (query) => readRecentEvents(db, babyId, query, now),
        nextWindows: () => Promise.resolve(prediction),
        zone,
        context: buildContext({ ageWeeks, events: contextEvents, prediction, zone }),
        history: buildHistory(historyRows),
      }),
      classifyHealth(
        text,
        sparkJson(apiKey, { name: "health_check", schema: CLASSIFIER_SCHEMA }, REASONING_EFFORT),
      ),
    ]);
    // classifyHealth never rejects; treat a rejection as a classifier error anyway.
    const verdict = classifier.status === "fulfilled" ? classifier.value : null;

    if (agent.status === "rejected") {
      // The agent failed, but a health turn still gets its card.
      const escalation = applyHealthGate({ keyword, classifier: verdict, caption: null });
      if (!escalation) return museFailure(agent.reason);
      await storeReply(admin, threadId, null, escalation, null);
      return json(reply({ transcript, caption: null, escalation, proposals: [], source, threadId }));
    }

    const result = agent.value;
    const escalation = applyHealthGate({ keyword, classifier: verdict, caption: result.caption });
    const caption = escalation ? null : result.caption;
    await storeReply(admin, threadId, caption, escalation, proposalSummary(result.proposals, zone));
    return json(reply({ transcript, caption, escalation, proposals: result.proposals, source, threadId }));
  } catch (error) {
    return museFailure(error);
  }
});

function reply(input: {
  transcript: string | undefined;
  caption: string | null;
  escalation: Escalation | null;
  proposals: unknown[];
  source: "chat" | "voice";
  threadId: string;
}) {
  return {
    ...(input.transcript !== undefined ? { transcript: input.transcript } : {}),
    caption: input.caption,
    escalation: input.escalation,
    proposals: input.proposals,
    source: input.source,
    thread_id: input.threadId,
  };
}

/**
 * The assistant's side of the turn, written with the service role after
 * checkThread passed. A failure here is logged and the reply still goes out:
 * the parent already has the proposals and the card.
 */
async function storeReply(
  admin: ReturnType<typeof adminClient>,
  threadId: string,
  caption: string | null,
  escalation: Escalation | null,
  summary: string | null,
): Promise<void> {
  const { error } = await admin.from("chat_messages").insert({
    thread_id: threadId,
    role: "assistant",
    content: caption,
    escalation: escalation ? (escalation.urgent ? "urgent" : "health") : null,
    proposal_summary: summary,
    author_id: null,
  });
  if (error) console.error("chat: reply_insert_failed", error.code);
}

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
