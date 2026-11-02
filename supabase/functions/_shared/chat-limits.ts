// Chat caps, max_tokens and the spend breaker: every number in one place.
//
// PRICES ARE ASSUMED. There is no Meta Model API price list in the repo; these are the
// security review's assumptions (docs/security-review-2026-11-02.md, item 4). Replace
// them with real prices when known; the reservation and the breaker follow.
//
// Per turn, before any model call, the chat function checks (consume_chat_budget):
//   - the hourly cap per user (consume_rate_limit, unchanged since v1.0.0);
//   - the daily cap per user (10 for accounts under an hour old) and per family (turns);
//   - the global daily spend: the turn reserves WORST_TURN_MICROS, runs with a
//     SpendMeter, then settles to what it metered. With every in-flight turn holding
//     its worst case, the day's spend can't pass the budget (CHAT_GLOBAL_DAILY_USD, $10
//     by default).
// Any refusal is the existing 429 { error: "rate_limited" }.

/** Assumed prices, USD. Reasoning tokens are billed as output (they count in completion_tokens). */
export const PRICES = {
  inputPerMTok: 1,
  outputPerMTok: 4,
  asrPerMinute: 0.006,
} as const;

export const CHAT_LIMITS = {
  /** Unchanged since v1.0.0. */
  hourlyPerUser: 60,
  /** A parent logging every feed, sleep and diaper by voice makes ~25–35 turns a day. */
  dailyPerUser: 60,
  /** Both parents together; one parent alone is held by dailyPerUser first. */
  dailyPerFamily: 100,
  /**
   * Accounts younger than newAccountSeconds get at most this many turns that UTC day
   * (v1.1.1): throwaway sign-ups can't drain the global breaker. The demo accounts are
   * old (the seed updates them in place), and judges who keep testing pass the hour.
   */
  newAccountDailyTurns: 10,
  newAccountSeconds: 3600,
  /**
   * Global circuit breaker, the default: the most the chat function may spend on Muse in
   * one UTC day. The Edge secret CHAT_GLOBAL_DAILY_USD overrides it (globalDailyMicros).
   */
  globalDailyUsd: 10,
  /** The secret's accepted range, USD. At least one worst-case turn (~$0.78) must fit. */
  globalDailyUsdMin: 1,
  globalDailyUsdMax: 100,
} as const;

/**
 * max_completion_tokens per call. Reasoning tokens count against it (measured 2 Nov:
 * a 40-token cap ended with finish_reason "length", 38 of 40 tokens reasoning).
 * Largest seen on 2 Nov (reasoning_effort "low"): agent 1201, summary 1059, classifier
 * 1468 (30 calls on hard urgent prompts; a first limit of 1024 cut 2 of 15 and cost
 * urgent agreement in a safety run). 4096 sits above what each call's timeout allows
 * (~180 tokens/s: 10 s classifier, 30 s agent and summary), so the timeout, not the
 * limit, ends a long call. See docs/chat.md, "Token limits".
 */
export const MAX_TOKENS = {
  agent: 4096,
  classifier: 4096,
  summary: 4096,
} as const;

export type CallKind = keyof typeof MAX_TOKENS;

/**
 * Upper bounds on input tokens per call, for the worst case only (the meter charges
 * what the API reports). Measured 2 Nov: agent 16.7k with 30 long history messages,
 * 150 context events and a 1000-character message; + a 4000-character summary and three
 * rounds of tool results and earlier output -> 40k. Classifier ~1.05k + the message.
 * Summary 34.6k for a 150-message fold -> 60k.
 */
export const INPUT_TOKENS_MAX: Record<CallKind, number> = {
  agent: 40_000,
  classifier: 4_000,
  summary: 60_000,
};

/** Attempts per call: the first plus retries on 408/409/429/5xx and connection errors. */
export const ATTEMPTS: Record<CallKind, number> = { agent: 2, classifier: 1, summary: 2 };

/** Calls per turn at most: the agent loop (MAX_ITERATIONS in agent.ts), one classifier, two summary drafts. */
export const CALLS_PER_TURN: Record<CallKind, number> = { agent: 4, classifier: 1, summary: 2 };

/** A voice clip is at most 30 s (voice.ts). */
export const ASR_SECONDS_MAX = 30;

const MICROS_PER_USD = 1_000_000;

/** Worst cost of one attempt, in micro-USD: the input bound plus max_tokens, all billed. */
export function worstCallMicros(kind: CallKind): number {
  return INPUT_TOKENS_MAX[kind] * PRICES.inputPerMTok + MAX_TOKENS[kind] * PRICES.outputPerMTok;
}

export function asrMicros(seconds: number): number {
  return Math.ceil((seconds / 60) * PRICES.asrPerMinute * MICROS_PER_USD);
}

/** Every call at its worst, every attempt billed, a fold and a 30 s clip: ~$0.78 at the assumed prices. */
export const WORST_TURN_MICROS = (Object.keys(MAX_TOKENS) as CallKind[]).reduce(
  (sum, kind) => sum + CALLS_PER_TURN[kind] * ATTEMPTS[kind] * worstCallMicros(kind),
  asrMicros(ASR_SECONDS_MAX),
);

/** The default global budget ($10), in micro-USD. */
export const GLOBAL_DAILY_MICROS = CHAT_LIMITS.globalDailyUsd * MICROS_PER_USD;

/**
 * The global daily budget in micro-USD from the Edge secret CHAT_GLOBAL_DAILY_USD (read per
 * request, so `supabase secrets set` changes it without a redeploy). A plain decimal number
 * of dollars from $1 to $100; missing, malformed or out of range -> the $10 default.
 */
export function globalDailyMicros(raw: string | undefined): number {
  const text = raw?.trim() ?? "";
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(text)) return GLOBAL_DAILY_MICROS;
  const usd = Number(text);
  if (!(usd >= CHAT_LIMITS.globalDailyUsdMin && usd <= CHAT_LIMITS.globalDailyUsdMax)) {
    return GLOBAL_DAILY_MICROS;
  }
  return Math.round(usd * MICROS_PER_USD);
}

export type Usage = { prompt_tokens?: number; completion_tokens?: number } | null | undefined;

/** What one turn spends on Muse, at the assumed prices. */
export class SpendMeter {
  #micros = 0;

  get micros(): number {
    return Math.ceil(this.#micros);
  }

  /** A completed call. Without usage figures it is charged at its worst. */
  call(kind: CallKind, usage: Usage): void {
    const input = usage?.prompt_tokens;
    const output = usage?.completion_tokens;
    if (typeof input !== "number" || typeof output !== "number" || input < 0 || output < 0) {
      this.failed(kind);
      return;
    }
    this.#micros += input * PRICES.inputPerMTok + output * PRICES.outputPerMTok;
  }

  /** A failed attempt (error or timeout): charged at its worst, in case it was billed. */
  failed(kind: CallKind): void {
    this.#micros += worstCallMicros(kind);
  }

  audio(seconds: number): void {
    this.#micros += asrMicros(Math.max(0, seconds));
  }
}
