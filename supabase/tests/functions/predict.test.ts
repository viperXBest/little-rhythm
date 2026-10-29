// The predict Edge Function against the local stack.
// Run: supabase start (serves the functions), then (env from `supabase status -o env`):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test -A supabase/tests/functions/
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

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
const endpoint = `${url}/functions/v1/predict`;

async function createUser(label: string): Promise<{ id: string; token: string }> {
  const email = `${label}-${crypto.randomUUID()}@test.local`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, token: signIn.data.session.access_token };
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

const ZONE = { tz: "Europe/Bucharest", tz_offset_minutes: 120 };

Deno.test({
  name: "predict: 401 without a JWT, 409 without a baby, windows for the session baby",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const noAuth = await call(ZONE);
    assertEquals(noAuth.status, 401);
    await noAuth.body?.cancel();

    const garbage = await call(ZONE, "not-a-jwt");
    assertEquals(garbage.status, 401);
    await garbage.body?.cancel();

    const lonely = await createUser("predict-nofamily");
    const parent = await createUser("predict-parent");
    let familyId: string | null = null;
    try {
      const noBaby = await call(ZONE, lonely.token);
      assertEquals(noBaby.status, 409);
      assertEquals(await noBaby.json(), { error: "not_in_family" });

      const family = await admin.from("families").insert({ created_by: parent.id }).select("id").single();
      if (family.error) throw family.error;
      familyId = family.data.id;
      const member = await admin.from("family_members").insert({ family_id: familyId, user_id: parent.id });
      if (member.error) throw member.error;
      const baby = await admin
        .from("babies")
        .insert({ family_id: familyId, name: "Test", birth_date: "2026-07-29" })
        .select("id")
        .single();
      if (baby.error) throw baby.error;
      const lastFeed = new Date(Date.now() - 30 * 60_000);
      const feed = await admin.from("events").insert({
        baby_id: baby.data.id,
        type: "feed",
        started_at: lastFeed.toISOString(),
        details: { kind: "bottle", ml: 90 },
        created_by: parent.id,
        source: "tap",
      });
      if (feed.error) throw feed.error;

      // Extra keys (a baby id from the client) are rejected outright.
      const injected = await call({ ...ZONE, baby_id: baby.data.id }, parent.token);
      assertEquals(injected.status, 400);
      await injected.body?.cancel();

      const ok = await call(ZONE, parent.token);
      assertEquals(ok.status, 200);
      const body = await ok.json();
      assertEquals(body.zone, "iana");
      assert(typeof body.age_weeks === "number");
      // One feed, no history: the age band from the last feed.
      assertEquals(body.feed.window.basis, "age");
      assert(Date.parse(body.feed.window.start) > lastFeed.getTime());
      assertEquals(body.nap, { window: null, reason: "no_sleep_logged" });
      for (const key of ["routine", "bedtime", "wake"]) assert(key in body);
      // No ids in the response.
      assertEquals(JSON.stringify(body).includes(baby.data.id), false);
    } finally {
      if (familyId) await admin.from("families").delete().eq("id", familyId);
      for (const user of [lonely, parent]) await admin.auth.admin.deleteUser(user.id);
    }
  },
});
