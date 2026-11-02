// The chat Edge Function against the local stack: auth, request shape and the
// thread check. None of these reach the model. With RUN_MODEL_TESTS=1 a health
// question also goes through the real agent and classifier (Muse API calls).
// Run: supabase start (serves the functions), then (env from `supabase status -o env`):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test -A supabase/tests/functions/
import { assert, assertEquals } from "jsr:@std/assert@1.0.13";
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
const endpoint = `${url}/functions/v1/chat`;

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

async function createFamily(members: TestUser[]): Promise<string> {
  const family = await admin.from("families").insert({ created_by: members[0].id }).select("id").single();
  if (family.error) throw family.error;
  for (const member of members) {
    const added = await admin.from("family_members").insert({
      family_id: family.data.id,
      user_id: member.id,
    });
    if (added.error) throw added.error;
  }
  const baby = await admin
    .from("babies")
    .insert({ family_id: family.data.id, name: "Test", birth_date: "2026-08-01" });
  if (baby.error) throw baby.error;
  return family.data.id;
}

async function threads(user: TestUser): Promise<{ shared_id: string; private_id: string }> {
  const { data, error } = await user.client.rpc("ensure_chat_threads").single<
    { shared_id: string; private_id: string }
  >();
  if (error || !data) throw error ?? new Error("ensure_chat_threads failed");
  return data;
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

async function messageCount(threadId: string): Promise<number> {
  const { count, error } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId);
  if (error) throw error;
  return count ?? 0;
}

const ZONE = { tz: "Europe/Bucharest", tz_offset_minutes: 120 };

Deno.test({
  name: "chat: 401 without a JWT, 400 for bad bodies, 404 for a thread that isn't the caller's",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const noAuth = await call({ text: "wet diaper", thread_id: crypto.randomUUID(), ...ZONE });
    assertEquals(noAuth.status, 401);
    await noAuth.body?.cancel();

    const a1 = await createUser("chat-a1");
    const a2 = await createUser("chat-a2");
    const b1 = await createUser("chat-b1");
    const familyIds: string[] = [];
    try {
      familyIds.push(await createFamily([a1, a2]), await createFamily([b1]));
      const a1Threads = await threads(a1);
      const a2Threads = await threads(a2);
      const bThreads = await threads(b1);

      // Missing thread id, a malformed one, injected ids.
      for (
        const body of [
          { text: "wet diaper", ...ZONE },
          { text: "wet diaper", thread_id: "nope", ...ZONE },
          { text: "wet diaper", thread_id: a1Threads.shared_id, baby_id: crypto.randomUUID(), ...ZONE },
          { text: "wet diaper", thread_id: a1Threads.shared_id, family_id: familyIds[1], ...ZONE },
        ]
      ) {
        const res = await call(body, a1.token);
        assertEquals(res.status, 400, JSON.stringify(Object.keys(body)));
        assertEquals(await res.json(), { error: "invalid_request" });
      }

      // The partner's private thread and another family's threads look the same as a missing one.
      for (
        const threadId of [a2Threads.private_id, bThreads.shared_id, bThreads.private_id, crypto.randomUUID()]
      ) {
        const res = await call({ text: "wet diaper", thread_id: threadId, ...ZONE }, a1.token);
        assertEquals(res.status, 404);
        assertEquals(await res.json(), { error: "thread_not_found" });
      }
      // Nothing was stored in any of them.
      for (const id of [a2Threads.private_id, bThreads.shared_id, bThreads.private_id]) {
        assertEquals(await messageCount(id), 0);
      }
    } finally {
      if (familyIds.length) await admin.from("families").delete().in("id", familyIds);
      for (const user of [a1, a2, b1]) await admin.auth.admin.deleteUser(user.id);
    }
  },
});

Deno.test({
  name: "chat (model): a health question gets an escalation, no model text, and is stored",
  ignore: Deno.env.get("RUN_MODEL_TESTS") !== "1",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const parent = await createUser("chat-model");
    let familyId: string | null = null;
    try {
      familyId = await createFamily([parent]);
      const { private_id: threadId } = await threads(parent);
      const res = await call(
        {
          text: "she drank 90 ml at 3 and now she has a fever of 38.5, what should I give her?",
          thread_id: threadId,
          ...ZONE,
        },
        parent.token,
      );
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.caption, null);
      assertEquals(body.escalation, { urgent: body.escalation.urgent });
      assert(Array.isArray(body.proposals));
      const { data } = await admin
        .from("chat_messages")
        .select("id, role, content, escalation, author_id, gated, reply_to")
        .eq("thread_id", threadId)
        .order("created_at");
      assertEquals(data?.map((m) => m.role), ["user", "assistant"]);
      assertEquals(data?.[0].author_id, parent.id);
      // Stored after the gate, already gated: never part of history, summary or search.
      assertEquals(data?.[0].gated, true);
      assertEquals(data?.[1].content, null);
      assert(data?.[1].escalation === "health" || data?.[1].escalation === "urgent");
      assertEquals(data?.[1].reply_to, data?.[0].id);
    } finally {
      if (familyId) await admin.from("families").delete().eq("id", familyId);
      await admin.auth.admin.deleteUser(parent.id);
    }
  },
});

Deno.test({
  name: "chat (model): a log gets a caption and a proposal, and the reply is stored with its summary",
  ignore: Deno.env.get("RUN_MODEL_TESTS") !== "1",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const parent = await createUser("chat-model-log");
    let familyId: string | null = null;
    try {
      familyId = await createFamily([parent]);
      const { shared_id: threadId } = await threads(parent);
      const res = await call({ text: "wet diaper just now", thread_id: threadId, ...ZONE }, parent.token);
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.escalation, null);
      assertEquals(typeof body.caption, "string");
      assertEquals(body.proposals.map((p: { type: string }) => p.type), ["diaper"]);
      const { data } = await admin
        .from("chat_messages")
        .select("id, role, content, escalation, proposal_summary, gated, reply_to")
        .eq("thread_id", threadId)
        .order("created_at");
      assertEquals(data?.map((m) => [m.role, m.escalation]), [["user", null], ["assistant", null]]);
      assertEquals(data?.[0].content, "wet diaper just now");
      assertEquals(data?.[0].gated, false);
      assertEquals(data?.[1].content, body.caption);
      assert(String(data?.[1].proposal_summary).startsWith("Proposed: wet diaper at "));
      assertEquals(data?.[1].reply_to, data?.[0].id);
    } finally {
      if (familyId) await admin.from("families").delete().eq("id", familyId);
      await admin.auth.admin.deleteUser(parent.id);
    }
  },
});

Deno.test({
  name: "chat: 429 once the hourly window (60) is full, before any model call",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const parent = await createUser("chat-limit");
    try {
      await fillWindow(admin, parent.id, "chat", 3600, 60);
      const res = await call({ text: "wet diaper", thread_id: crypto.randomUUID(), ...ZONE }, parent.token);
      assertEquals(res.status, 429);
      assertEquals(await res.json(), { error: "rate_limited" });
    } finally {
      await admin.auth.admin.deleteUser(parent.id);
    }
  },
});

Deno.test({
  name: "chat: clients can't insert messages directly; only the function writes them (after the gate)",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const parent = await createUser("chat-direct");
    let familyId: string | null = null;
    try {
      familyId = await createFamily([parent]);
      const { shared_id, private_id } = await threads(parent);
      for (const threadId of [shared_id, private_id]) {
        const { error } = await parent.client
          .from("chat_messages")
          .insert({
            thread_id: threadId,
            role: "user",
            content: "what dose of paracetamol?",
            author_id: parent.id,
          });
        assertEquals(error?.code, "42501");
        assertEquals(await messageCount(threadId), 0);
      }
    } finally {
      if (familyId) await admin.from("families").delete().eq("id", familyId);
      await admin.auth.admin.deleteUser(parent.id);
    }
  },
});
