// Agentic logging and the buddy: text or a voice clip in, a reply and proposals out.
// POST application/json        { text, thread_id, tz_offset_minutes, tz? }
// POST multipart/form-data      audio (16 kHz mono PCM16 WAV), thread_id, tz_offset_minutes, tz?
//   -> { transcript?, caption, escalation, proposals, steps, source: "chat" | "voice", thread_id }
// steps: what the agent did, as fixed labels built from the tools that ran (agent.ts,
// STEP_LABELS), never model text; [] on an escalated turn. Apps before v1.1.1 ignore it.
// No event is saved here: the app shows each proposal as a confirm card and
// inserts it with the parent's own session (RLS). The baby comes from the
// session, never from the body or the model.
//
// Limits (_shared/chat-limits.ts), all before any model call and all answered with
// the same 429 rate_limited: 60 an hour per user, then (after the thread check, so
// voice turns count too) a daily cap per user (10 for accounts under an hour old) and
// per family and the global spend
// breaker. Each admitted turn reserves its worst-case cost and settles to what its
// Muse calls (and any memory fold) actually reported.
//
// Every turn passes the health gate (_shared/health-gate.ts): a keyword check on
// the message and a Muse classifier running beside the agent. The classifier also
// reads, as context, at most the 2 previous parent messages of the thread from the
// last 30 minutes, each marked escalated or not (gated ones included; never an
// assistant reply). A positive turn returns an escalation with no model text; the
// app shows a static card.
//
// The turn is stored in the thread after the gate has decided, with the service
// role and only after the thread was checked to be the caller's: the parent's
// message (text or transcript, never audio; gated = true when the turn escalated),
// then the assistant's (caption or escalation flag, plus a server-built proposal
// summary, linked by reply_to). Clients can't insert messages at all.
// After the response, older messages may be folded into the thread's summary
// (_shared/thread-memory.ts). Text, transcripts,
// audio and tool arguments are never logged.

import { MAX_STEPS, runAgent } from "../_shared/agent.ts";
import { buildContext, buildHistory, proposalSummary } from "../_shared/buddy-context.ts";
import {
  ageInWeeks,
  checkThread,
  readContextEvents,
  readFamilyNames,
  readFoldMessages,
  readGateContext,
  readOpenSleep,
  readPredictionEvents,
  readRecentEvents,
  readThreadHistory,
  readThreadMemory,
  resolveBaby,
  searchThread,
  writeThreadMemory,
} from "../_shared/chat-data.ts";
import {
  applyHealthGate,
  CLASSIFIER_SCHEMA,
  classifyHealth,
  type Escalation,
} from "../_shared/health-gate.ts";
import { keywordHit, parentCrisis } from "../_shared/health-keywords.ts";
import { languageBias } from "../_shared/asr-language.ts";
import { CHAT_LIMITS, globalDailyMicros, SpendMeter, WORST_TURN_MICROS } from "../_shared/chat-limits.ts";
import { MuseError, sparkComplete, sparkJson, sparkText, transcribe } from "../_shared/muse.ts";
import { predict } from "../_shared/predict.ts";
import { EMPTY_SUMMARY, maybeFoldMemory, runInBackground } from "../_shared/thread-memory.ts";
import { parseZone } from "../_shared/zone.ts";
import { adminClient, getCaller, json, userClient } from "../_shared/supabase.ts";
import { checkHeaders, parseChatRequest } from "./request.ts";

const LIMIT = { fn: "chat", windowSeconds: 3600, max: CHAT_LIMITS.hourlyPerUser } as const;
// Chosen from the Day 4 latency test (see docs/chat.md).
const REASONING_EFFORT = "low" as const;
const KNOWN_FAILURES = new Set([
  "open_sleep_failed",
  "recent_events_failed",
  "week_events_failed",
  "context_events_failed",
  "history_failed",
  "gate_context_failed",
  "search_failed",
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

  // Daily caps and the global breaker: the last check before any model call.
  const budget = await consumeBudget(admin, user.id);
  if (budget === null) return json({ error: "internal_error" }, 500);
  if (budget.outcome !== "ok") {
    console.warn(`chat: daily_cap_${budget.outcome}`);
    return json({ error: "rate_limited" }, 429);
  }
  const meter = new SpendMeter();
  let settled = false;
  // Replaces the reservation with the metered cost, once, after the last model call.
  const settle = async () => {
    if (settled) return;
    settled = true;
    await settleSpend(admin, budget.dayStart, meter);
  };

  let text: string;
  let transcript: string | undefined;
  if (request.kind === "voice") {
    try {
      transcript = await transcribe(request.wav, apiKey, languageBias(request.lang), meter);
    } catch (error) {
      await settle();
      return museFailure(error);
    }
    if (!transcript) {
      await settle();
      return json({ error: "no_speech" }, 422);
    }
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
    const [openSleep, contextEvents, predictionEvents, historyRows, memoryRow, gateTurns] = await Promise.all(
      [
        readOpenSleep(db, babyId),
        readContextEvents(db, babyId, now),
        readPredictionEvents(db, babyId, now),
        readThreadHistory(db, threadId),
        // Memory is a nice-to-have: a failed read means no summary this turn.
        readThreadMemory(db, threadId).catch(() => null),
        // The classifier's context (gated turns included, marked). Not optional: a failed
        // read fails the turn like the history read, so the gate never runs without it.
        readGateContext(db, threadId, now),
      ],
    );
    const memory = memoryRow && memoryRow.summary !== EMPTY_SUMMARY ? memoryRow.summary : null;
    // After the response: fold older messages into the summary (no added latency),
    // then settle the turn's spend, fold included.
    const foldMemory = () =>
      runInBackground(async () => {
        try {
          return await maybeFoldMemory({
            readMemory: () => readThreadMemory(db, threadId),
            readSince: (since, cap) => readFoldMessages(db, threadId, since, cap),
            readNames: () => readFamilyNames(db),
            summarize: sparkText(apiKey, REASONING_EFFORT, meter),
            write: (next, previous) => writeThreadMemory(admin, threadId, next, previous),
          });
        } finally {
          await settle();
        }
      });
    const prediction = predict({ now, zone, birthDate, events: predictionEvents });

    const keyword = keywordHit(text);
    const crisis = parentCrisis(text);
    const [agent, classifier] = await Promise.allSettled([
      runAgent({
        text,
        now,
        offsetMinutes: request.offsetMinutes,
        ageWeeks,
        openSleep,
        complete: sparkComplete(apiKey, REASONING_EFFORT, meter),
        recentEvents: (query) => readRecentEvents(db, babyId, query, now),
        nextWindows: () => Promise.resolve(prediction),
        zone,
        context: buildContext({ ageWeeks, events: contextEvents, prediction, zone }),
        history: buildHistory(historyRows),
        memory,
        searchHistory: (query) => searchThread(db, threadId, query),
      }),
      classifyHealth(
        text,
        ageWeeks,
        gateTurns,
        sparkJson(apiKey, { name: "health_check", schema: CLASSIFIER_SCHEMA }, REASONING_EFFORT, meter),
      ),
    ]);
    // classifyHealth never rejects; treat a rejection as a classifier error anyway.
    const verdict = classifier.status === "fulfilled" ? classifier.value : null;
    // The gate fails closed: a turn whose classifier failed escalates.
    if (verdict === null) console.error("health_gate: classifier_failed");

    if (agent.status === "rejected") {
      // The agent failed, but a health turn still gets its card. When both calls failed
      // (an outage) and no keyword hit, there is no model text either way: the parent
      // gets an error and retries, and nothing is stored.
      const escalation = verdict === null && !keyword.health
        ? null
        : applyHealthGate({ keyword, classifier: verdict, caption: null, crisis });
      if (!escalation) {
        await settle();
        return museFailure(agent.reason);
      }
      const replyTo = await storeUserMessage(admin, { threadId, userId: user.id, text, gated: true });
      await storeReply(admin, { threadId, replyTo, caption: null, escalation, summary: null });
      foldMemory();
      return json(
        reply({ transcript, caption: null, escalation, proposals: [], steps: [], source, threadId }),
      );
    }

    const result = agent.value;
    const escalation = applyHealthGate({ keyword, classifier: verdict, caption: result.caption, crisis });
    const caption = escalation ? null : result.caption;
    // Stored only now that the gate has decided, so a health question is never
    // stored ungated, not even for a moment.
    const replyTo = await storeUserMessage(admin, {
      threadId,
      userId: user.id,
      text,
      gated: escalation !== null,
    });
    await storeReply(admin, {
      threadId,
      replyTo,
      caption,
      escalation,
      summary: proposalSummary(result.proposals, zone),
    });
    foldMemory();
    return json(reply({
      transcript,
      caption,
      escalation,
      proposals: result.proposals,
      // An escalated turn shows no model work, only the static card (and any log cards).
      steps: escalation ? [] : result.steps,
      source,
      threadId,
    }));
  } catch (error) {
    await settle();
    return museFailure(error);
  }
});

const OUTCOMES = ["ok", "user", "new_account", "family", "global"] as const;
type Budget = { outcome: (typeof OUTCOMES)[number]; dayStart: string };

/**
 * consume_chat_budget (service role): the daily cap per user (smaller for an account under
 * an hour old: "new_account"), then per family, then a worst-case reservation against the
 * global daily budget (CHAT_GLOBAL_DAILY_USD, $10 by default). Null on a database error
 * (the turn is refused: fails closed).
 */
async function consumeBudget(admin: ReturnType<typeof adminClient>, userId: string): Promise<Budget | null> {
  const { data, error } = await admin
    .rpc("consume_chat_budget", {
      p_user_id: userId,
      p_user_max: CHAT_LIMITS.dailyPerUser,
      p_family_max: CHAT_LIMITS.dailyPerFamily,
      p_global_max: globalDailyMicros(Deno.env.get("CHAT_GLOBAL_DAILY_USD")),
      p_reserve: WORST_TURN_MICROS,
      p_new_account_max: CHAT_LIMITS.newAccountDailyTurns,
      p_new_account_seconds: CHAT_LIMITS.newAccountSeconds,
    })
    .single<{ outcome: string; day_start: string }>();
  if (error || !data) {
    console.error("chat: budget failed", error?.code ?? "no_row");
    return null;
  }
  const outcome = data.outcome;
  const known = OUTCOMES.find((o) => o === outcome);
  if (!known) {
    console.error("chat: budget failed", "bad_outcome");
    return null;
  }
  return { outcome: known, dayStart: data.day_start };
}

/** settle_chat_spend (service role). A failure keeps the full reservation (fails safe). */
async function settleSpend(
  admin: ReturnType<typeof adminClient>,
  dayStart: string,
  meter: SpendMeter,
): Promise<void> {
  try {
    const { error } = await admin.rpc("settle_chat_spend", {
      p_window_start: dayStart,
      p_reserved: WORST_TURN_MICROS,
      p_actual: meter.micros,
    });
    if (error) console.error("chat: settle failed", error.code);
  } catch {
    console.error("chat: settle failed", "unexpected");
  }
}

function reply(input: {
  transcript: string | undefined;
  caption: string | null;
  escalation: Escalation | null;
  proposals: unknown[];
  steps: string[];
  source: "chat" | "voice";
  threadId: string;
}) {
  return {
    ...(input.transcript !== undefined ? { transcript: input.transcript } : {}),
    caption: input.caption,
    escalation: input.escalation,
    proposals: input.proposals,
    steps: input.steps.slice(0, MAX_STEPS),
    source: input.source,
    thread_id: input.threadId,
  };
}

/**
 * The parent's message (text or transcript, never audio), stored after the gate.
 * Inserted with the service role (clients have no INSERT on chat_messages), with
 * author = the verified caller and gated as the gate decided; checkThread has
 * already passed. Returns the row id for the reply's reply_to, or null: a failure
 * is logged and the reply still goes out.
 */
async function storeUserMessage(
  admin: ReturnType<typeof adminClient>,
  input: { threadId: string; userId: string; text: string; gated: boolean },
): Promise<string | null> {
  const row = { thread_id: input.threadId, role: "user", content: input.text, author_id: input.userId };
  const { data, error } = await admin
    .from("chat_messages")
    .insert({ ...row, gated: input.gated })
    .select("id")
    .single();
  if (error) {
    console.error("chat: message_insert_failed", error.code);
    return null;
  }
  return data.id;
}

/**
 * The assistant's side of the turn, written with the service role after
 * checkThread passed, linked to the parent's message (reply_to) so deleting
 * their account removes the whole turn. A failure here is logged and the reply
 * still goes out: the parent already has the proposals and the card.
 */
async function storeReply(
  admin: ReturnType<typeof adminClient>,
  input: {
    threadId: string;
    replyTo: string | null;
    caption: string | null;
    escalation: Escalation | null;
    summary: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("chat_messages").insert({
    thread_id: input.threadId,
    role: "assistant",
    content: input.caption,
    escalation: input.escalation ? (input.escalation.urgent ? "urgent" : "health") : null,
    proposal_summary: input.summary,
    author_id: null,
    reply_to: input.replyTo,
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
