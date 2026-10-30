// seedDemo against the local stack: two runs give the same state, another
// family is untouched, and a demo family with an outside member is refused.
// Uses a fixed clock inside the valid range, so it passes at any hour.
// Run: supabase start, then (env from `supabase status -o env`):
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx -y deno@2 test -A scripts/seed-demo/seed.test.ts
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1.0.13";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

import { type Accounts, describe, NAMES, seedDemo, SeedError } from "./seed.ts";

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** 2026-10-20 17:30 in Bucharest: fixed, in the past, inside the valid range. */
const NOW = new Date("2026-10-20T14:30:00Z");

function accounts(): Accounts {
  const tag = crypto.randomUUID().slice(0, 8);
  return {
    parent1: { email: `seed-demo-p1-${tag}@test.local`, password: crypto.randomUUID() },
    parent2: { email: `seed-demo-p2-${tag}@test.local`, password: crypto.randomUUID() },
  };
}

async function userId(email: string): Promise<string> {
  for (let page = 1;; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email === email);
    if (user) return user.id;
    if (data.users.length < 1000) throw new Error("user not found");
  }
}

async function rows<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** The demo family's state with ids replaced by labels, so two runs can be compared. */
async function snapshot(acc: Accounts) {
  const label = new Map([[await userId(acc.parent1.email), "parent1"], [
    await userId(acc.parent2.email),
    "parent2",
  ]]);
  const ids = [...label.keys()];
  const members = await rows(
    admin.from("family_members").select("family_id, user_id, role").in("user_id", ids),
  );
  const familyIds = [...new Set(members.map((m) => m.family_id as string))];
  assertEquals(familyIds.length, 1);
  const familyId = familyIds[0];
  const families = await rows(admin.from("families").select("created_by").eq("id", familyId));
  const babies = await rows(admin.from("babies").select("id, name, birth_date").eq("family_id", familyId));
  assertEquals(babies.length, 1);
  const events = await rows(
    admin.from("events").select("type, started_at, ended_at, details, created_by, source")
      .eq("baby_id", babies[0].id).order("started_at").order("type"),
  );
  const checkins = await rows(
    admin.from("checkins").select("day, user_id, answers").eq("family_id", familyId).order("day").order(
      "user_id",
    ),
  );
  const threads = await rows(admin.from("chat_threads").select("id").eq("family_id", familyId));
  const profiles = await rows(admin.from("profiles").select("id, display_name").in("id", ids));
  const name = (id: unknown) => label.get(id as string) ?? `other:${id}`;
  return {
    familyId,
    state: {
      creator: name(families[0].created_by),
      members: members.map((m) => `${name(m.user_id)}:${m.role}`).sort(),
      profiles: profiles.map((p) => `${name(p.id)}:${p.display_name}`).sort(),
      baby: { name: babies[0].name, birth_date: babies[0].birth_date },
      events: events.map((e) => ({ ...e, created_by: name(e.created_by) })),
      checkins: checkins.map((c) => ({ ...c, user_id: name(c.user_id) })).sort((a, b) =>
        `${a.day}${a.user_id}`.localeCompare(`${b.day}${b.user_id}`)
      ),
      threads: threads.length,
    },
  };
}

/** An unrelated family with a parent, a baby, an event and a check-in. */
async function otherFamily() {
  const email = `seed-demo-other-${crypto.randomUUID().slice(0, 8)}@test.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const user = data.user.id;
  const family = await admin.from("families").insert({ created_by: user }).select("id").single();
  if (family.error) throw family.error;
  const familyId = family.data.id as string;
  await rows(admin.from("family_members").insert({ family_id: familyId, user_id: user }).select());
  const baby = await admin.from("babies").insert({
    family_id: familyId,
    name: "Other",
    birth_date: "2026-08-01",
  })
    .select("id").single();
  if (baby.error) throw baby.error;
  await rows(
    admin.from("events").insert({
      baby_id: baby.data.id,
      type: "feed",
      started_at: "2026-10-19T10:00:00Z",
      details: { kind: "bottle", ml: 120 },
      created_by: user,
    }).select(),
  );
  await rows(
    admin.from("checkins").insert({
      family_id: familyId,
      user_id: user,
      day: "2026-10-19",
      answers: { mood: 4, help: "" },
    })
      .select(),
  );
  const state = async () => ({
    families: await rows(admin.from("families").select("*").eq("id", familyId)),
    members: await rows(admin.from("family_members").select("*").eq("family_id", familyId)),
    babies: await rows(admin.from("babies").select("*").eq("family_id", familyId)),
    events: await rows(admin.from("events").select("*").eq("baby_id", baby.data.id)),
    checkins: await rows(admin.from("checkins").select("*").eq("family_id", familyId)),
  });
  return { user, familyId, state };
}

async function cleanup(acc: Accounts, extraUsers: string[], extraFamilies: string[]) {
  const ids = [
    ...await Promise.all([acc.parent1.email, acc.parent2.email].map((e) => userId(e).catch(() => null))),
    ...extraUsers,
  ].filter((id): id is string => id !== null);
  const members = await rows(admin.from("family_members").select("family_id").in("user_id", ids));
  const families = [...new Set([...members.map((m) => m.family_id as string), ...extraFamilies])];
  if (families.length > 0) await admin.from("families").delete().in("id", families);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
}

Deno.test({
  name: "two runs give the same demo state; another family is untouched",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const acc = accounts();
    const other = await otherFamily();
    try {
      const before = await other.state();
      const first = await seedDemo({ admin, accounts: acc, now: NOW });
      assertEquals(first.resetFamilies, 0);
      const a = await snapshot(acc);

      // A chat thread made since the first run goes with the reset.
      await rows(admin.from("chat_threads").insert({ family_id: a.familyId }).select());
      const second = await seedDemo({ admin, accounts: acc, now: NOW });
      assertEquals(second.resetFamilies, 1);
      const b = await snapshot(acc);

      assert(a.familyId !== b.familyId, "the family is recreated");
      assertEquals(b.state, a.state);
      assertEquals(a.state.members, ["parent1:parent", "parent2:parent"]);
      assertEquals(a.state.profiles, [`parent1:${NAMES.parent1}`, `parent2:${NAMES.parent2}`]);
      assertEquals(a.state.threads, 0);
      assertEquals(a.state.events.length, first.plan.events.length);
      assertEquals(a.state.checkins.length, 6);
      assertEquals((await rows(admin.from("families").select("id").eq("id", a.familyId))).length, 0);

      assertEquals(await other.state(), before);

      // The printed summary carries names, counts and times, never a login.
      const printed = describe(second);
      assert(printed.includes(NAMES.parent1) && printed.includes("Night feeds"), printed);
      // The take's expected card, in the seed's zone (default: no phone-zone warning).
      assert(
        /Next up at 17:30 \(Europe\/Bucharest\): nap \d\d:\d\d–\d\d:\d\d, routine starts \d\d:\d\d tonight/
          .test(printed),
        printed,
      );
      assert(!printed.includes("Set both phones"), printed);
      for (
        const secret of [acc.parent1.email, acc.parent1.password, acc.parent2.email, acc.parent2.password]
      ) {
        assert(!printed.includes(secret));
      }

      // The seeded passwords work.
      const anon = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
        auth: { persistSession: false },
      });
      const signIn = await anon.auth.signInWithPassword(acc.parent2);
      assertEquals(signIn.error, null);
    } finally {
      await cleanup(acc, [other.user], [other.familyId]);
    }
  },
});

Deno.test({
  name: "a demo family with another member is refused and left as it was",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const acc = accounts();
    const other = await otherFamily();
    try {
      await seedDemo({ admin, accounts: acc, now: NOW });
      const before = await snapshot(acc);
      // A non-demo account ends up in the demo family.
      await rows(admin.from("family_members").delete().eq("user_id", other.user).select());
      await rows(
        admin.from("family_members").insert({ family_id: before.familyId, user_id: other.user }).select(),
      );

      const error = await assertRejects(() => seedDemo({ admin, accounts: acc, now: NOW }), SeedError);
      assertEquals(error.code, "other_member");
      const after = await snapshot(acc);
      assertEquals(after.familyId, before.familyId);
      assertEquals(after.state.events, before.state.events);
    } finally {
      await cleanup(acc, [other.user], [other.familyId]);
    }
  },
});

Deno.test({
  name: "a night-time run is refused before anything is written, and works with the suggested --tz",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const acc = accounts();
    const evening = new Date("2026-10-20T18:00:00Z"); // 21:00 in Bucharest
    const error = await assertRejects(() => seedDemo({ admin, accounts: acc, now: evening }), SeedError);
    assertEquals(error.code, "outside_window");
    assert(/Record between \d\d:\d\d and \d\d:\d\d there/.test(error.message), error.message);
    // Suggests a zone where it is day, which then works.
    const tz = /--tz (\S+) /.exec(error.message)?.[1];
    assert(tz, error.message);
    await assertRejects(() => userId(acc.parent1.email));

    const bad = await assertRejects(
      () => seedDemo({ admin, accounts: acc, now: evening, tz: "Mars/Olympus" }),
      SeedError,
    );
    assertEquals(bad.code, "bad_tz");
    await assertRejects(() => userId(acc.parent1.email));

    try {
      const summary = await seedDemo({ admin, accounts: acc, now: evening, tz });
      const printed = describe(summary);
      assert(printed.includes(`(${tz}): nap `), printed);
      assert(printed.includes(`Set both phones (or the emulator) to ${tz}`), printed);
    } finally {
      await cleanup(acc, [], []);
    }
  },
});
