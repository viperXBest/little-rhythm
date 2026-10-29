// Meta Model API clients. Called only from Edge Functions; MODEL_API_KEY is an
// Edge Function secret. Requests and responses are never logged.

import OpenAI from "npm:openai@7.32.0";

import type { Complete, Message, ToolCall } from "./agent.ts";
import type { ClassifyCall } from "./health-gate.ts";

export const MUSE_BASE_URL = "https://api.meta.ai/v1";
export const SPARK_MODEL = "muse-spark-1.3";
export const TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";

const TRANSCRIBE_TIMEOUT_MS = 20_000;
const CHAT_TIMEOUT_MS = 30_000;
/** The health classifier runs beside the agent; a slow one must not hold the reply. */
const CLASSIFY_TIMEOUT_MS = 10_000;

export type MuseErrorCode = "transcribe_failed" | "model_failed";

export class MuseError extends Error {
  constructor(readonly code: MuseErrorCode, readonly status?: number) {
    super(code);
  }
}

/** Muse Voice Transcribe: WAV in (already checked by checkVoiceWav), text out. */
export async function transcribe(wav: Uint8Array<ArrayBuffer>, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append(
    "request",
    new Blob([JSON.stringify({ mode: "PUSH_TO_TALK", model: TRANSCRIBE_MODEL, audioEncoding: "WAV" })], {
      type: "application/json",
    }),
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

/** Muse Spark through the OpenAI-compatible Chat Completions API. */
export function sparkComplete(apiKey: string, reasoningEffort?: ReasoningEffort): Complete {
  const client = new OpenAI({
    apiKey,
    baseURL: MUSE_BASE_URL,
    timeout: CHAT_TIMEOUT_MS,
    maxRetries: 1,
  });
  return async (messages, tools) => {
    try {
      const res = await client.chat.completions.create({
        model: SPARK_MODEL,
        messages,
        tools,
        tool_choice: "auto",
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      });
      const message = res.choices[0]?.message;
      if (!message) throw new MuseError("model_failed");
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
 * classifier. Returns the raw JSON text; the caller validates it with zod.
 */
export function sparkJson(
  apiKey: string,
  schema: { name: string; schema: Record<string, unknown> },
  reasoningEffort?: ReasoningEffort,
): ClassifyCall {
  const client = new OpenAI({
    apiKey,
    baseURL: MUSE_BASE_URL,
    timeout: CLASSIFY_TIMEOUT_MS,
    maxRetries: 0,
  });
  return async (messages) => {
    try {
      const res = await client.chat.completions.create({
        model: SPARK_MODEL,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: schema.name, strict: true, schema: schema.schema },
        },
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      });
      return res.choices[0]?.message?.content ?? null;
    } catch (error) {
      throw new MuseError("model_failed", error instanceof OpenAI.APIError ? error.status : undefined);
    }
  };
}

/** Muse Spark as a plain text completion (no tools), for the thread summary. */
export function sparkText(
  apiKey: string,
  reasoningEffort?: ReasoningEffort,
): (messages: Message[]) => Promise<string | null> {
  const client = new OpenAI({
    apiKey,
    baseURL: MUSE_BASE_URL,
    timeout: CHAT_TIMEOUT_MS,
    maxRetries: 1,
  });
  return async (messages) => {
    try {
      const res = await client.chat.completions.create({
        model: SPARK_MODEL,
        messages,
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      });
      return res.choices[0]?.message?.content ?? null;
    } catch (error) {
      throw new MuseError("model_failed", error instanceof OpenAI.APIError ? error.status : undefined);
    }
  };
}
