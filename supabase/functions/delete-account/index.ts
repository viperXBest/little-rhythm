// Account deletion (F8). The caller re-enters their password, checked here
// against Auth. A stolen session alone can't delete the account unless the
// attacker can also change the password; with secure password change on, Auth
// allows that without reauthentication only for sessions under 24 h old
// (residual risk, see docs/security.md "Account deletion").
// POST { password } -> { deleted: true }
// Last member of the family: the family and everything under it goes.
// One parent of two: their own data and shared-thread turns go; the partner's stay
// (delete_account_data in 20261030090000_delete_account.sql). Then the auth user.
// The password and email are never logged.

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { z } from "npm:zod@4.6.6";

import { adminClient, getCaller, json } from "../_shared/supabase.ts";

const RequestBody = z.strictObject({ password: z.string().min(1).max(200) });

// Each attempt is a password guess: keep it low.
const LIMIT = { fn: "delete_account", windowSeconds: 3600, max: 5 } as const;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = adminClient();
  const user = await getCaller(req, admin);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data: allowed, error: limitError } = await admin.rpc("consume_rate_limit", {
    p_user_id: user.id,
    p_function: LIMIT.fn,
    p_window_seconds: LIMIT.windowSeconds,
    p_max: LIMIT.max,
  });
  if (limitError) {
    console.error("delete-account: rate limit failed", limitError.code);
    return json({ error: "internal_error" }, 500);
  }
  if (allowed !== true) return json({ error: "rate_limited" }, 429);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const parsed = RequestBody.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_request" }, 400);

  const check = user.email ? await checkPassword(user.id, user.email, parsed.data.password) : "wrong";
  // Auth's own sign-in limit: not a wrong password, so the app says "try later".
  if (check === "auth_rate_limited") return json({ error: "rate_limited" }, 429);
  if (check === "wrong") return json({ error: "invalid_password" }, 403);

  const { error: dataError } = await admin.rpc("delete_account_data", { p_user_id: user.id });
  if (dataError) {
    console.error("delete-account: data delete failed", dataError.code);
    return json({ error: "internal_error" }, 500);
  }

  // delete_account_data is idempotent, so a retry after a failure here finishes the job.
  const { error: authError } = await admin.auth.admin.deleteUser(user.id);
  if (authError) {
    console.error("delete-account: auth delete failed", authError.status ?? "no_status");
    return json({ error: "internal_error" }, 500);
  }
  return json({ deleted: true });
});

/** Signs in on a throwaway client; "ok" only for the caller's own account. */
async function checkPassword(
  userId: string,
  email: string,
  password: string,
): Promise<"ok" | "wrong" | "auth_rate_limited"> {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("missing env");
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error?.status === 429) return "auth_rate_limited";
  return !error && data.user?.id === userId ? "ok" : "wrong";
}
