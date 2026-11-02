import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import OpenAI from "npm:openai@7.32.0";

import { MAX_ITERATIONS } from "./agent.ts";
import {
  ASR_SECONDS_MAX,
  CALLS_PER_TURN,
  CHAT_LIMITS,
  GLOBAL_DAILY_MICROS,
  MAX_TOKENS,
  SpendMeter,
  WORST_TURN_MICROS,
  worstCallMicros,
} from "./chat-limits.ts";
import { retryable } from "./muse.ts";
import { VOICE_MAX_MS } from "./voice.ts";

Deno.test("worst case per turn: every call at its bound, every attempt billed, a fold and a 30 s clip", () => {
  // agent 4 x 2 x (40k + 2048 x 4) + classifier 1 x (4k + 1024 x 4) + summary 2 x 2 x (60k + 2048 x 4) + 3000
  assertEquals(worstCallMicros("agent"), 48_192);
  assertEquals(worstCallMicros("classifier"), 8_096);
  assertEquals(worstCallMicros("summary"), 68_192);
  assertEquals(WORST_TURN_MICROS, 385_536 + 8_096 + 272_768 + 3_000);
  assertEquals(WORST_TURN_MICROS, 669_400); // ~$0.67 at the assumed prices
});

Deno.test("the bounds match the code they describe", () => {
  assertEquals(CALLS_PER_TURN.agent, MAX_ITERATIONS);
  assertEquals(ASR_SECONDS_MAX * 1000, VOICE_MAX_MS);
  assertEquals(MAX_TOKENS, { agent: 2048, classifier: 1024, summary: 2048 });
});

Deno.test("the global budget is $10 a day and holds a dozen worst-case turns in flight", () => {
  assertEquals(CHAT_LIMITS.globalDailyUsd, 10);
  assertEquals(GLOBAL_DAILY_MICROS, 10_000_000);
  assert(Math.floor(GLOBAL_DAILY_MICROS / WORST_TURN_MICROS) >= 12);
  assert(CHAT_LIMITS.dailyPerUser <= CHAT_LIMITS.dailyPerFamily);
});

Deno.test("meter: reported usage at the assumed prices, reasoning billed as output", () => {
  const meter = new SpendMeter();
  // A typical logging turn (2 Nov): two agent calls and the classifier.
  meter.call("agent", { prompt_tokens: 3044, completion_tokens: 520 });
  meter.call("agent", { prompt_tokens: 3200, completion_tokens: 60 });
  meter.call("classifier", { prompt_tokens: 1048, completion_tokens: 290 });
  assertEquals(meter.micros, 3044 + 520 * 4 + 3200 + 60 * 4 + 1048 + 290 * 4);
  assert(meter.micros < 15_000); // about a cent
});

Deno.test("meter: a failed attempt or missing usage is charged at its worst; audio by the second", () => {
  const meter = new SpendMeter();
  meter.failed("agent");
  meter.call("summary", undefined);
  meter.call("classifier", { prompt_tokens: -1, completion_tokens: 3 });
  meter.audio(30);
  assertEquals(meter.micros, 48_192 + 68_192 + 8_096 + 3_000);
});

Deno.test("retries follow the SDK's rule: 408, 409, 429, 5xx and connection errors only", () => {
  const status = (s: number) => OpenAI.APIError.generate(s, undefined, "x", new Headers());
  for (const s of [408, 409, 429, 500, 503]) assertEquals(retryable(status(s)), true, String(s));
  for (const s of [400, 401, 403, 404, 422]) assertEquals(retryable(status(s)), false, String(s));
  assertEquals(retryable(new OpenAI.APIConnectionError({ message: "down" })), true);
  assertEquals(retryable(new OpenAI.APIConnectionTimeoutError()), true);
  assertEquals(retryable(new Error("other")), false);
});
