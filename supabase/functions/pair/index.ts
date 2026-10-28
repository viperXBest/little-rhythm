// Pairing: a parent creates a one-time code, the partner redeems it.
// POST { action: "create" }              -> { code, expires_at }
// POST { action: "redeem", code: "..." } -> { family_id }
// Codes are never stored or logged in clear; only an HMAC with PAIR_CODE_PEPPER.

import { z } from "npm:zod@3.24.2";

import { formatCode, generateCode, hashCode, normalizeCode } from "../_shared/pair-code.ts";
import { adminClient, getCaller, json } from "../_shared/supabase.ts";

const RequestBody = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create") }).strict(),
  z.object({ action: z.literal("redeem"), code: z.string().min(1).max(32) }).strict(),
]);

const LIMITS = {
  create: { fn: "pair_create", windowSeconds: 3600, max: 10 },
  redeem: { fn: "pair_redeem", windowSeconds: 900, max: 5 },
} as const;

// Errors raised by the SQL functions that are safe to return to the client.
const KNOWN_ERRORS = new Set([
  "invalid_or_expired_code",
  "already_in_family",
  "family_full",
  "not_in_family",
]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const pepper = Deno.env.get("PAIR_CODE_PEPPER");
  if (!pepper || pepper.length < 32) {
    console.error("pair: PAIR_CODE_PEPPER missing or too short");
    return json({ error: "server_misconfigured" }, 500);
  }

  const admin = adminClient();
  const user = await getCaller(req, admin);
  if (!user) return json({ error: "unauthorized" }, 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const parsed = RequestBody.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const body = parsed.data;

  const limit = LIMITS[body.action];
  const { data: allowed, error: limitError } = await admin.rpc("consume_rate_limit", {
    p_user_id: user.id,
    p_function: limit.fn,
    p_window_seconds: limit.windowSeconds,
    p_max: limit.max,
  });
  if (limitError) {
    console.error("pair: rate limit failed", limitError.code);
    return json({ error: "internal_error" }, 500);
  }
  if (allowed !== true) return json({ error: "rate_limited" }, 429);

  if (body.action === "create") {
    // Retry on the (astronomically unlikely) hash collision.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateCode();
      const { data: expiresAt, error } = await admin.rpc("create_invite", {
        p_user_id: user.id,
        p_code_hash: await hashCode(code, pepper),
      });
      if (!error) return json({ code: formatCode(code), expires_at: expiresAt });
      if (error.code === "23505") continue;
      return errorResponse(error.message, error.code);
    }
    return json({ error: "internal_error" }, 500);
  }

  const code = normalizeCode(body.code);
  if (!code) return json({ error: "invalid_or_expired_code" }, 400);
  const { data: familyId, error } = await admin.rpc("redeem_invite", {
    p_user_id: user.id,
    p_code_hash: await hashCode(code, pepper),
  });
  if (error) return errorResponse(error.message, error.code);
  return json({ family_id: familyId });
});

function errorResponse(message: string, code: string | undefined): Response {
  if (KNOWN_ERRORS.has(message)) {
    return json({ error: message }, message === "invalid_or_expired_code" ? 400 : 409);
  }
  // A concurrent join can hit the one-family-per-user constraint.
  if (code === "23505") return json({ error: "already_in_family" }, 409);
  console.error("pair: rpc failed", code);
  return json({ error: "internal_error" }, 500);
}
