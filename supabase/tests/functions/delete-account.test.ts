// The delete-account Edge Function against the local stack: the password check,
// the rate limit, and both deletion paths. No model calls.
// Run: supabase start (serves the functions), then (env from `supabase status -o env`):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test -A supabase/tests/functions/
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

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
const endpoint = `${url}/functions/v1/delete-account`;

type TestUser = { id: string; password: string; token: string; client: SupabaseClient };

async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${crypto.randomUUID()}@test.local`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, password, token: signIn.data.session.access_token, client };
}

/** Awaits a query and throws on an error; null data is allowed only when asked for. */
async function must<T>(query: PromiseLike<{ data: T; error: unknown }>): Promise<NonNullable<T>> {
  const { data, error } = await query;
  if (error) throw error;
  if (data === null || data === undefined) throw new Error("no data");
  return data;
}

async function run(query: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await query;
  if (error) throw error;
}

async function count(table: string, column: string, value: string): Promise<number> {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(
    column,
    value,
  );
  if (error) throw error;
  return count ?? 0;
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

async function userExists(id: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(id);
  return !error && data.user !== null;
}

/** One parent's turn in a thread: their message and the buddy's reply linked to it. */
async function turn(
  threadId: string,
  author: TestUser,
  text: string,
): Promise<{ user: string; reply: string }> {
  const user = await must(
    admin.from("chat_messages").insert({
      thread_id: threadId,
      role: "user",
      content: text,
      author_id: author.id,
    })
      .select("id").single(),
  );
  const reply = await must(
    admin.from("chat_messages").insert({
      thread_id: threadId,
      role: "assistant",
      content: `reply to ${text}`,
      author_id: null,
      reply_to: user.id,
    }).select("id").single(),
  );
  return { user: user.id, reply: reply.id };
}

async function cleanup(familyId: string | null, users: TestUser[]): Promise<void> {
  if (familyId) await admin.from("families").delete().eq("id", familyId);
  for (const user of users) await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
}

Deno.test({
  name: "delete-account: 401 without a JWT, 400 for a bad body, 403 and nothing deleted on a wrong password",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const noAuth = await call({ password: "x" });
    assertEquals(noAuth.status, 401);
    await noAuth.body?.cancel();

    const parent = await createUser("del-wrong");
    try {
      for (
        const body of [{}, { password: "" }, { password: parent.password, user_id: crypto.randomUUID() }]
      ) {
        const res = await call(body, parent.token);
        assertEquals(res.status, 400, JSON.stringify(Object.keys(body)));
        assertEquals(await res.json(), { error: "invalid_request" });
      }
      const res = await call({ password: "not-the-password" }, parent.token);
      assertEquals(res.status, 403);
      assertEquals(await res.json(), { error: "invalid_password" });
      assert(await userExists(parent.id));
      assertEquals(await count("profiles", "id", parent.id), 1);
    } finally {
      await cleanup(null, [parent]);
    }
  },
});

Deno.test({
  name: "delete-account: 429 once the hourly window is full, before the password is checked",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const parent = await createUser("del-limit");
    try {
      // Five attempts are allowed; the sixth is refused even with the right password.
      for (let i = 0; i < 5; i++) {
        const res = await call({ password: "not-the-password" }, parent.token);
        assertEquals(res.status, 403);
        await res.body?.cancel();
      }
      const res = await call({ password: parent.password }, parent.token);
      assertEquals(res.status, 429);
      assertEquals(await res.json(), { error: "rate_limited" });
      assert(await userExists(parent.id));
    } finally {
      await cleanup(null, [parent]);
    }
  },
});

Deno.test({
  name: "delete-account: one parent leaves, then the last member takes the family",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const a = await createUser("del-a");
    const b = await createUser("del-b");
    let familyId: string | null = null;
    try {
      // A creates the family and the baby; B joins.
      const family = String(
        await must(
          a.client.rpc("create_family", { p_baby_name: "Test", p_baby_birth_date: "2026-08-01" }),
        ),
      );
      familyId = family;
      await run(admin.from("family_members").insert({ family_id: family, user_id: b.id }));
      const baby = await must(admin.from("babies").select("id").eq("family_id", family).single());

      const eventA = await must(
        a.client.from("events").insert({
          baby_id: baby.id,
          type: "diaper",
          started_at: new Date().toISOString(),
          created_by: a.id,
          details: { wet: true },
        })
          .select("id").single(),
      );
      const eventB = await must(
        b.client.from("events").insert({
          baby_id: baby.id,
          type: "diaper",
          started_at: new Date().toISOString(),
          created_by: b.id,
          details: { dirty: true },
        })
          .select("id").single(),
      );
      const today = new Date().toISOString().slice(0, 10);
      await run(
        a.client.from("checkins").insert({
          family_id: family,
          user_id: a.id,
          day: today,
          answers: { mood: 3, help: "a nap" },
        }),
      );
      await run(
        b.client.from("checkins").insert({
          family_id: family,
          user_id: b.id,
          day: today,
          answers: { mood: 4, help: "coffee" },
        }),
      );
      // A's pending invite, and the used one B joined with.
      const pending = await must(
        admin.from("invites").insert({
          family_id: family,
          code_hash: crypto.randomUUID(),
          expires_at: new Date(Date.now() + 864e5).toISOString(),
          created_by: a.id,
        })
          .select("id").single(),
      );
      const used = await must(
        admin.from("invites").insert({
          family_id: family,
          code_hash: crypto.randomUUID(),
          expires_at: new Date(Date.now() - 864e5).toISOString(),
          used_at: new Date(Date.now() - 2 * 864e5).toISOString(),
          used_by: b.id,
          created_by: a.id,
        }).select("id").single(),
      );

      const aThreads = await must(
        a.client.rpc("ensure_chat_threads").single<{ shared_id: string; private_id: string }>(),
      );
      const bThreads = await must(
        b.client.rpc("ensure_chat_threads").single<{ shared_id: string; private_id: string }>(),
      );
      const shared = aThreads.shared_id;
      // Both parents chat in the shared thread, interleaved, and each in their private one.
      const a1 = await turn(shared, a, "A: bath at 7?");
      const b1 = await turn(shared, b, "B: I'll do the bath");
      const a2 = await turn(shared, a, "A: thanks");
      const b2 = await turn(shared, b, "B: and the night feed");
      await turn(aThreads.private_id, a, "A private");
      const bPrivate = await turn(bThreads.private_id, b, "B private");
      const now = new Date().toISOString();
      await run(
        admin.from("thread_memory").insert([
          { thread_id: shared, summary: "Shared summary.", covered_until: now },
          { thread_id: aThreads.private_id, summary: "A private summary.", covered_until: now },
          { thread_id: bThreads.private_id, summary: "B private summary.", covered_until: now },
        ]),
      );
      // A has used another function this hour.
      await run(
        admin.rpc("consume_rate_limit", {
          p_user_id: a.id,
          p_function: "chat",
          p_window_seconds: 3600,
          p_max: 60,
        }),
      );
      await run(
        admin.rpc("consume_rate_limit", {
          p_user_id: b.id,
          p_function: "chat",
          p_window_seconds: 3600,
          p_max: 60,
        }),
      );

      // ---- A leaves -------------------------------------------------------------
      const resA = await call({ password: a.password }, a.token);
      assertEquals(resA.status, 200);
      assertEquals(await resA.json(), { deleted: true });

      // Nothing authored by A remains.
      assert(!(await userExists(a.id)));
      assertEquals(await count("profiles", "id", a.id), 0);
      assertEquals(await count("family_members", "user_id", a.id), 0);
      assertEquals(await count("checkins", "user_id", a.id), 0);
      assertEquals(await count("api_usage", "user_id", a.id), 0);
      assertEquals(await count("chat_messages", "author_id", a.id), 0);
      assertEquals(await count("chat_threads", "id", aThreads.private_id), 0);
      assertEquals(await count("thread_memory", "thread_id", aThreads.private_id), 0);
      for (const id of [a1.user, a1.reply, a2.user, a2.reply]) {
        assertEquals(await count("chat_messages", "id", id), 0);
      }
      // The shared summary re-folds without A; A's pending invite is gone, the used one stays.
      assertEquals(await count("thread_memory", "thread_id", shared), 0);
      assertEquals(await count("invites", "id", pending.id), 0);
      assertEquals(await count("invites", "id", used.id), 1);
      // A's event stays, without an author.
      const kept = await must(admin.from("events").select("created_by").eq("id", eventA.id).single());
      assertEquals(kept.created_by, null);

      // B's data is intact, including B's shared-thread turns and their replies.
      assert(await userExists(b.id));
      assertEquals(await count("profiles", "id", b.id), 1);
      assertEquals(await count("family_members", "user_id", b.id), 1);
      assertEquals(await count("checkins", "user_id", b.id), 1);
      assertEquals(await count("api_usage", "user_id", b.id), 1);
      assertEquals(await count("families", "id", family), 1);
      assertEquals(await count("babies", "id", baby.id), 1);
      const sharedIds = await must(
        admin.from("chat_messages").select("id").eq("thread_id", shared).order("created_at"),
      );
      assertEquals(sharedIds.map((m) => m.id), [b1.user, b1.reply, b2.user, b2.reply]);
      for (const id of [bPrivate.user, bPrivate.reply]) {
        assertEquals(await count("chat_messages", "id", id), 1);
      }
      assertEquals(await count("thread_memory", "thread_id", bThreads.private_id), 1);
      const bEvent = await must(admin.from("events").select("created_by").eq("id", eventB.id).single());
      assertEquals(bEvent.created_by, b.id);

      // ---- B, now the last member, leaves -----------------------------------------
      const resB = await call({ password: b.password }, b.token);
      assertEquals(resB.status, 200);
      assert(!(await userExists(b.id)));
      for (
        const [table, column, value] of [
          ["families", "id", family],
          ["babies", "family_id", family],
          ["events", "baby_id", baby.id],
          ["invites", "family_id", family],
          ["chat_threads", "family_id", family],
          ["chat_messages", "thread_id", shared],
          ["chat_messages", "thread_id", bThreads.private_id],
          ["thread_memory", "thread_id", bThreads.private_id],
          ["checkins", "family_id", family],
          ["api_usage", "user_id", b.id],
          ["profiles", "id", b.id],
        ] as const
      ) {
        assertEquals(await count(table, column, value), 0, `${table}.${column}`);
      }
      familyId = null;
    } finally {
      await cleanup(familyId, [a, b]);
    }
  },
});
