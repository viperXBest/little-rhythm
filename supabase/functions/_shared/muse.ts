// Meta Model API clients. Called only from Edge Functions; MODEL_API_KEY is an
// Edge Function secret. Requests and responses are never logged.
// Every Muse Spark call carries max_completion_tokens (chat-limits.ts) and reports its
// usage to the turn's SpendMeter, which settles the global spend breaker.

import OpenAI from "npm:openai@7.32.0";

import type { Complete, Message, ToolCall } from "./agent.ts";
import { ATTEMPTS, type CallKind, MAX_TOKENS, type SpendMeter } from "./chat-limits.ts";
import type { ClassifyCall } from "./health-gate.ts";

export const MUSE_BASE_URL = "https://api.meta.ai/v1";
export const SPARK_MODEL = "muse-spark-1.3";
export const TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";

const TRANSCRIBE_TIMEOUT_MS = 20_000;
const CHAT_TIMEOUT_MS = 30_000;
/** The health classifier runs beside the agent; a slow one must not hold the reply. */
// The classifier runs beside the agent (CHAT_TIMEOUT_MS), so matching its timeout adds no latency to a
// typical turn; at 10 s a slow API (about 120 tokens/s on 2 Nov) timed out long classifications.
const CLASSIFY_TIMEOUT_MS = 30_000;
/** 16 kHz mono PCM16. */
const WAV_BYTES_PER_SECOND = 32_000;

export type MuseErrorCode = "transcribe_failed" | "model_failed";

export class MuseError extends Error {
  constructor(readonly code: MuseErrorCode, readonly status?: number) {
    super(code);
  }
}

/**
 * Muse Voice Transcribe: WAV in (already checked by checkVoiceWav), text out.
 * languageBias steers recognition without forcing it (see asr-language.ts).
 * No keywords: measured on Day 8, they gave no consistent gain and added
 * repeated words (docs/chat.md, "Transcription").
 */
export async function transcribe(
  wav: Uint8Array<ArrayBuffer>,
  apiKey: string,
  languageBias: string[],
  meter?: SpendMeter,
): Promise<string> {
  // Charged up front, whatever the outcome.
  meter?.audio(Math.ceil(wav.byteLength / WAV_BYTES_PER_SECOND));
  const form = new FormData();
  form.append(
    "request",
    new Blob(
      [JSON.stringify({ mode: "PUSH_TO_TALK", model: TRANSCRIBE_MODEL, audioEncoding: "WAV", languageBias })],
      { type: "application/json" },
    ),
  );
  form.append("audio", new Blob([wav], { type: "audio/wav" }), "clip.wav");

  let res: Response;
  try {
    res = await fetch(`${MUSE_BASE_URL}/asr/transcribe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
  } catch {
    throw new MuseError("transcribe_failed");
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new MuseError("transcribe_failed", res.status);
  }
  const body: unknown = await res.json().catch(() => null);
  const transcript = body && typeof body === "object" && "transcript" in body ? body.transcript : null;
  if (typeof transcript !== "string") throw new MuseError("transcribe_failed", res.status);
  return transcript.trim();
}

export type ReasoningEffort = "low" | "medium" | "high";

type CompletionBody = Omit<
  OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  "max_completion_tokens" | "max_tokens"
>;
type ChatCompletion = OpenAI.Chat.Completions.ChatCompletion;

/** The SDK's own retry rule: 408, 409, 429, 5xx, connection errors and timeouts. */
export function retryable(error: unknown): boolean {
  if (error instanceof OpenAI.APIConnectionError) return true;
  if (!(error instanceof OpenAI.APIError) || error.status === undefined) return false;
  return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
}

/**
 * One Chat Completions call with max_completion_tokens for its kind and ATTEMPTS[kind]
 * attempts. The SDK's own retries are off (maxRetries: 0) so the meter sees every
 * attempt: a completed one is charged its reported usage, a failed one its worst case.
 */
async function create(
  client: OpenAI,
  kind: CallKind,
  body: CompletionBody,
  meter: SpendMeter | undefined,
): Promise<ChatCompletion> {
  for (let attempt = 1;; attempt++) {
    try {
      const res = await client.chat.completions.create({ ...body, max_completion_tokens: MAX_TOKENS[kind] });
      meter?.call(kind, res.usage);
      return res;
    } catch (error) {
      meter?.failed(kind);
      if (attempt >= ATTEMPTS[kind] || !retryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

/**
 * Muse Spark through the OpenAI-compatible Chat Completions API. A reply cut off by
 * max_completion_tokens (finish_reason "length") comes back as truncated with no tool
 * calls, so a half-written tool call is never run.
 */
export function sparkComplete(
  apiKey: string,
  reasoningEffort?: ReasoningEffort,
  meter?: SpendMeter,
): Complete {
  const client = new OpenAI({
    apiKey,
    baseURL: MUSE_BASE_URL,
    timeout: CHAT_TIMEOUT_MS,
    maxRetries: 0,
  });
  return async (messages, tools) => {
    try {
      const res = await create(client, "agent", {
        model: SPARK_MODEL,
        messages,
        tools,
        tool_choice: "auto",
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      }, meter);
      const choice = res.choices[0];
      const message = choice?.message;
      if (!message) throw new MuseError("model_failed");
      if (choice.finish_reason === "length") {
        return { content: message.content ?? null, tool_calls: [], truncated: true };
      }
      const toolCalls: ToolCall[] = [];
      for (const call of message.tool_calls ?? []) {
        if (call.type !== "function") continue;
        toolCalls.push({
          id: call.id,
          type: "function",
          function: { name: call.function.name, arguments: call.function.arguments },
        });
      }
      return { content: message.content ?? null, tool_calls: toolCalls };
    } catch (error) {
      if (error instanceof MuseError) throw error;
      throw new MuseError("model_failed", error instanceof OpenAI.APIError ? error.status : undefined);
    }
  };
}

/**
 * Muse Spark with structured output (strict JSON Schema), for the health
 * classifier. Returns the raw JSON text; the caller validates it with zod. A reply
 * cut off by max_completion_tokens returns null, which the gate treats as a failed
 * classifier (fails closed: the turn escalates).
 */
export function sparkJson(
  apiKey: string,
  schema: { name: string; schema: Record<string, unknown> },
  reasoningEffort?: ReasoningEffort,
  meter?: SpendMeter,
): ClassifyCall {
  const client = new OpenAI({
    apiKey,
    baseURL: MUSE_BASE_URL,
    timeout: CLASSIFY_TIMEOUT_MS,
    maxRetries: 0,
  });
  return async (messages) => {
    try {
      const res = await create(client, "classifier", {
        model: SPARK_MODEL,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: schema.name, strict: true, schema: schema.schema },
        },
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      }, meter);
      const choice = res.choices[0];
      return choice?.finish_reason === "length" ? null : choice?.message?.content ?? null;
    } catch (error) {
      throw new MuseError("model_failed", error instanceof OpenAI.APIError ? error.status : undefined);
    }
  };
}

/**
 * Muse Spark as a plain text completion (no tools), for the thread summary. A draft
 * cut off by max_completion_tokens returns null: it is never stored, and the fold
 * retries once with the stricter instruction, then keeps the old summary
 * (thread-memory.ts).
 */
export function sparkText(
  apiKey: string,
  reasoningEffort?: ReasoningEffort,
  meter?: SpendMeter,
): (messages: Message[]) => Promise<string | null> {
  const client = new OpenAI({
    apiKey,
    baseURL: MUSE_BASE_URL,
    timeout: CHAT_TIMEOUT_MS,
    maxRetries: 0,
  });
  return async (messages) => {
    try {
      const res = await create(client, "summary", {
        model: SPARK_MODEL,
        messages,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      }, meter);
      const choice = res.choices[0];
      return choice?.finish_reason === "length" ? null : choice?.message?.content ?? null;
    } catch (error) {
      throw new MuseError("model_failed", error instanceof OpenAI.APIError ? error.status : undefined);
    }
  };
}
