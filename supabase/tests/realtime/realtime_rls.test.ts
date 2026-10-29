// RLS on the Realtime stream, against the local stack.
// Run: supabase start, then (env from `supabase status -o env`):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test -A supabase/tests/realtime/
//
// A1 (family A) listens on events and family_members, including a channel
// filtered to baby B's id. Family B writes first, family A second. Realtime
// delivers changes in WAL order, so once A1 has received family A's change,
// family B's change has already been processed: if it was not delivered by
// then, RLS filtered it out.
//
// The second test applies the same ordering to chat_messages (A1's private
// thread vs the shared one) and checkins (hidden until the partner answered).
import { assert, assertEquals } from "jsr:@std/assert@1";
import { createClient, type RealtimeChannel, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

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

type Change = {
  table: string;
  eventType: string;
  row: Record<string, unknown>;
  errors: unknown;
};

async function createUser(label: string): Promise<{ id: string; client: SupabaseClient }> {
  const email = `${label}-${crypto.randomUUID()}@test.local`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  // Subscribe with the user's JWT, not the anon key.
  await client.realtime.setAuth(signIn.data.session.access_token);
  return { id: data.user.id, client };
}

async function createFamily(userId: string): Promise<{ familyId: string; babyId: string }> {
  const family = await admin.from("families").insert({ created_by: userId }).select("id").single();
  if (family.error) throw family.error;
  const member = await admin.from("family_members").insert({
    family_id: family.data.id,
    user_id: userId,
  });
  if (member.error) throw member.error;
  const baby = await admin
    .from("babies")
    .insert({ family_id: family.data.id, name: "Test", birth_date: "2026-09-01" })
    .select("id")
    .single();
  if (baby.error) throw baby.error;
  return { familyId: family.data.id, babyId: baby.data.id };
}

function subscribe(channel: RealtimeChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        reject(err ?? new Error(status));
      }
    });
  });
}

async function waitFor(predicate: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return predicate();
}

Deno.test({
  name: "realtime delivers only rows the subscriber can select",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const a1 = await createUser("a1");
    const a2 = await createUser("a2");
    const b1 = await createUser("b1");
    const b2 = await createUser("b2");
    const familyA = await createFamily(a1.id);
    const familyB = await createFamily(b1.id);

    const received: Change[] = [];
    const record =
      (table: string) => (payload: { eventType: string; new: Record<string, unknown>; errors: unknown }) =>
        received.push({
          table,
          eventType: payload.eventType,
          row: payload.new,
          errors: payload.errors,
        });

    // Snoop attempt: explicitly filtered to the other family's baby.
    const snoop = a1.client
      .channel("snoop")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `baby_id=eq.${familyB.babyId}` },
        record("events"),
      );
    const all = a1.client
      .channel("all")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, record("events"))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "family_members" },
        record("family_members"),
      );

    try {
      await Promise.all([subscribe(snoop), subscribe(all)]);

      // Warm-up: right after `supabase db reset` the WAL stream can lag behind
      // SUBSCRIBED. Log probes from A1 until one arrives, then start clean.
      let warm = false;
      for (let attempt = 0; attempt < 15 && !warm; attempt++) {
        const probe = await a1.client
          .from("events")
          .insert({ baby_id: familyA.babyId, type: "diaper", started_at: new Date().toISOString() })
          .select("id")
          .single();
        assertEquals(probe.error, null);
        warm = await waitFor(() => received.some((c) => c.row.id === probe.data?.id), 2_000);
      }
      assert(warm, "realtime stream is up");
      received.length = 0;

      // Family B: partner joins, logs a feed.
      const joinB = await admin.from("family_members").insert({
        family_id: familyB.familyId,
        user_id: b2.id,
      });
      assertEquals(joinB.error, null);
      const eventB = await b1.client
        .from("events")
        .insert({ baby_id: familyB.babyId, type: "feed", started_at: new Date().toISOString() })
        .select("id")
        .single();
      assertEquals(eventB.error, null);

      // Family A: partner joins, logs a feed.
      const joinA = await admin.from("family_members").insert({
        family_id: familyA.familyId,
        user_id: a2.id,
      });
      assertEquals(joinA.error, null);
      const eventA = await a2.client
        .from("events")
        .insert({ baby_id: familyA.babyId, type: "feed", started_at: new Date().toISOString() })
        .select("id")
        .single();
      assertEquals(eventA.error, null);

      const gotA = await waitFor(
        () => received.some((c) => c.table === "events" && c.row.id === eventA.data?.id),
        10_000,
      );
      assert(gotA, "A1 receives the partner's event (positive control)");
      assert(
        received.some((c) => c.table === "family_members" && c.row.user_id === a2.id),
        "A1 receives the partner joining",
      );

      const leaked = received.filter(
        (c) =>
          c.row.baby_id === familyB.babyId ||
          c.row.family_id === familyB.familyId ||
          c.row.id === eventB.data?.id,
      );
      assertEquals(leaked, [], "A1 receives nothing from family B");
      // An anon-key socket would get data-less "401" stubs here instead.
      assertEquals(received.filter((c) => c.errors), [], "no payload carries an auth error");
    } finally {
      await a1.client.removeAllChannels();
      for (const user of [a1, a2, b1, b2]) await admin.auth.admin.deleteUser(user.id);
      await admin.from("families").delete().in("id", [familyA.familyId, familyB.familyId]);
    }
  },
});

const isoDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

Deno.test({
  name: "realtime: the partner gets shared chat messages, and check-ins only after answering",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const a1 = await createUser("chat-a1");
    const a2 = await createUser("chat-a2");
    const family = await createFamily(a1.id);
    const join = await admin.from("family_members").insert({ family_id: family.familyId, user_id: a2.id });
    assertEquals(join.error, null);

    const threads = await a1.client.rpc("ensure_chat_threads").single<
      { shared_id: string; private_id: string }
    >();
    assertEquals(threads.error, null);
    const { shared_id: sharedId, private_id: privateId } = threads.data!;

    const received: Change[] = [];
    const record =
      (table: string) => (payload: { eventType: string; new: Record<string, unknown>; errors: unknown }) =>
        received.push({ table, eventType: payload.eventType, row: payload.new, errors: payload.errors });
    const channel = a2.client
      .channel("partner")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        record("chat_messages"),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkins" }, record("checkins"));

    const post = (threadId: string, content: string) =>
      a1.client
        .from("chat_messages")
        .insert({ thread_id: threadId, role: "user", content, author_id: a1.id })
        .select("id")
        .single();
    const checkIn = (user: { id: string; client: SupabaseClient }, day: string) =>
      user.client
        .from("checkins")
        .insert({ family_id: family.familyId, user_id: user.id, day, answers: { mood: 3, help: "" } })
        .select("id")
        .single();

    try {
      await subscribe(channel);
      let warm = false;
      for (let attempt = 0; attempt < 15 && !warm; attempt++) {
        const probe = await post(sharedId, "warm-up");
        assertEquals(probe.error, null);
        warm = await waitFor(() => received.some((c) => c.row.id === probe.data?.id), 2_000);
      }
      assert(warm, "realtime stream is up");
      received.length = 0;

      // Chat: private first, then shared.
      const privateMsg = await post(privateId, "private note");
      assertEquals(privateMsg.error, null);
      const sharedMsg = await post(sharedId, "shared note");
      assertEquals(sharedMsg.error, null);
      assert(
        await waitFor(() => received.some((c) => c.row.id === sharedMsg.data?.id), 10_000),
        "A2 receives the shared-thread message (positive control)",
      );
      assertEquals(
        received.filter((c) => c.row.thread_id === privateId),
        [],
        "A2 gets nothing from A1's private thread",
      );

      // Check-ins: A1 answers today while A2 has not; then both answer the next day, A2 first.
      const today = await checkIn(a1, isoDay(0));
      assertEquals(today.error, null);
      const a2Next = await checkIn(a2, isoDay(1));
      assertEquals(a2Next.error, null);
      const a1Next = await checkIn(a1, isoDay(1));
      assertEquals(a1Next.error, null);
      assert(
        await waitFor(() => received.some((c) => c.row.id === a1Next.data?.id), 10_000),
        "A2 receives A1's answer for a day A2 already answered (live reveal)",
      );
      assertEquals(
        received.filter((c) => c.row.id === today.data?.id),
        [],
        "A2 does not receive A1's answer for a day A2 has not answered",
      );
      assertEquals(received.filter((c) => c.errors), [], "no payload carries an auth error");
    } finally {
      await a2.client.removeAllChannels();
      for (const user of [a1, a2]) await admin.auth.admin.deleteUser(user.id);
      await admin.from("families").delete().eq("id", family.familyId);
    }
  },
});
