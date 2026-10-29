// The pair Edge Function against the local stack: create and redeem a code,
// single use, and the per-user rate limits.
// Run: supabase start (serves the functions), then (env from `supabase status -o env`):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test -A supabase/tests/functions/
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1.0.13";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

import { fillWindow } from "./rate-limit.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

const url = env("SUPABASE_URL");
const anonKey = env("SUPABASE_ANON_KEY");
const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const endpoint = `${url}/functions/v1/pair`;

type TestUser = { id: string; token: string; client: SupabaseClient };

async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${crypto.randomUUID()}@test.local`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, token: signIn.data.session.access_token, client };
}

function call(body: unknown, token?: string): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

Deno.test({
  name: "pair: create and redeem a code once; 401 without a JWT",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const noAuth = await call({ action: "create" });
    assertEquals(noAuth.status, 401);
    await noAuth.body?.cancel();

    const a = await createUser("pair-a");
    const b = await createUser("pair-b");
    const c = await createUser("pair-c");
    let familyId: string | null = null;
    try {
      const created = await a.client.rpc("create_family", {
        p_baby_name: "Test",
        p_baby_birth_date: "2026-08-01",
      });
      if (created.error) throw created.error;
      familyId = String(created.data);

      const res = await call({ action: "create" }, a.token);
      assertEquals(res.status, 200);
      const { code } = await res.json();
      assertMatch(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      // Only the hash is stored.
      const { data: invites } = await admin.from("invites").select("code_hash").eq("family_id", familyId);
      assert(invites?.every((i) => !i.code_hash.includes(code.replace("-", ""))));

      const redeemed = await call({ action: "redeem", code }, b.token);
      assertEquals(redeemed.status, 200);
      assertEquals(await redeemed.json(), { family_id: familyId });

      const again = await call({ action: "redeem", code }, c.token);
      assertEquals(again.status, 400);
      assertEquals(await again.json(), { error: "invalid_or_expired_code" });
    } finally {
      if (familyId) await admin.from("families").delete().eq("id", familyId);
      for (const user of [a, b, c]) await admin.auth.admin.deleteUser(user.id);
    }
  },
});

Deno.test({
  name: "pair: 429 once the redeem (5 per 15 min) or create (10 per hour) window is full",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const parent = await createUser("pair-limit");
    try {
      await fillWindow(admin, parent.id, "pair_redeem", 900, 5);
      const redeem = await call({ action: "redeem", code: "ABCD-EFGH" }, parent.token);
      assertEquals(redeem.status, 429);
      assertEquals(await redeem.json(), { error: "rate_limited" });

      await fillWindow(admin, parent.id, "pair_create", 3600, 10);
      const create = await call({ action: "create" }, parent.token);
      assertEquals(create.status, 429);
      assertEquals(await create.json(), { error: "rate_limited" });
    } finally {
      await admin.auth.admin.deleteUser(parent.id);
    }
  },
});
