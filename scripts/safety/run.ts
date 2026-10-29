// Runs the curated safety set against the LOCAL chat function and reports:
//   - escalation rate on health prompts (target 100%), and urgent agreement;
//   - false positives on non-health prompts;
//   - every miss, with its text.
// Fixtures: supabase/functions/chat/safety-health.json and safety-nonhealth.json,
// arrays of { text, category?, lang?, urgent? }.
//
// Every prompt is isolated: each worker has its own seeded user, family, baby
// and private thread, and before each call it deletes that thread's messages
// and the user's rate-limit rows. A missed health prompt therefore never sits
// in the agent's history, and workers never share a thread.
//
// Run from the repo root with the local stack up (`supabase start`):
//   eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
//   SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
//     npx -y deno@2 run -A scripts/safety/run.ts [--limit N] [--only health|nonhealth]
//
// Each prompt costs two Muse calls (agent and classifier) on the real API.
// Writes scripts/safety/out/report.json (gitignored).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

const WORKERS = 3;
const FIXTURES = {
  health: "supabase/functions/chat/safety-health.json",
  nonhealth: "supabase/functions/chat/safety-nonhealth.json",
} as const;
const OUT = "scripts/safety/out/report.json";
const ZONE = { tz: "Europe/Bucharest", tz_offset_minutes: 120 };

type SetName = keyof typeof FIXTURES;
type Prompt = { set: SetName; text: string; category: string; lang: string; urgent: boolean };
type Outcome = {
  set: SetName;
  text: string;
  category: string;
  lang: string;
  expectedUrgent: boolean;
  status: number;
  escalation: { urgent: boolean } | null;
  error?: string;
};

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing env ${name}`);
  return value;
}

const url = env("SUPABASE_URL");
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error(`refusing to run against ${host}: local stack only`);
}
const anonKey = env("SUPABASE_ANON_KEY");
const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function arg(name: string): string | undefined {
  const i = Deno.args.indexOf(name);
  return i >= 0 ? Deno.args[i + 1] : undefined;
}
const limit = arg("--limit") ? Number(arg("--limit")) : Infinity;
const only = arg("--only") as SetName | undefined;

async function loadFixture(set: SetName): Promise<Prompt[]> {
  let raw: string;
  try {
    raw = await Deno.readTextFile(FIXTURES[set]);
  } catch {
    throw new Error(`missing ${FIXTURES[set]}: curate it from scripts/safety/out/${set}-raw.json first`);
  }
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error(`${FIXTURES[set]} must be a JSON array`);
  return data.flatMap((item): Prompt[] => {
    if (!item || typeof item !== "object" || typeof item.text !== "string" || !item.text.trim()) return [];
    return [{
      set,
      text: item.text.slice(0, 1000),
      category: typeof item.category === "string" ? item.category : "",
      lang: typeof item.lang === "string" ? item.lang : "",
      urgent: item.urgent === true,
    }];
  });
}

type Worker = { userId: string; token: string; familyId: string; threadId: string };

async function seedWorker(i: number): Promise<Worker> {
  const email = `safety-${i}-${crypto.randomUUID()}@test.local`;
  const password = crypto.randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("createUser failed");
  const userId = created.data.user.id;
  const family = await admin.from("families").insert({ created_by: userId }).select("id").single();
  if (family.error) throw family.error;
  const member = await admin.from("family_members").insert({ family_id: family.data.id, user_id: userId });
  if (member.error) throw member.error;
  // About 10 weeks old, so every window and bedtime rule applies.
  const birth = new Date(Date.now() - 70 * 86_400_000).toISOString().slice(0, 10);
  const baby = await admin.from("babies").insert({
    family_id: family.data.id,
    name: "Test",
    birth_date: birth,
  });
  if (baby.error) throw baby.error;

  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const threads = await client.rpc("ensure_chat_threads").single<{ private_id: string }>();
  if (threads.error || !threads.data) throw threads.error ?? new Error("ensure_chat_threads failed");
  return {
    userId,
    token: signIn.data.session.access_token,
    familyId: family.data.id,
    threadId: threads.data.private_id,
  };
}

/** A clean slate for one prompt: no history in the thread, no rate-limit count. */
async function isolate(worker: Worker): Promise<void> {
  const messages = await admin.from("chat_messages").delete().eq("thread_id", worker.threadId);
  if (messages.error) throw messages.error;
  const usage = await admin.from("api_usage").delete().eq("user_id", worker.userId);
  if (usage.error) throw usage.error;
}

async function send(worker: Worker, prompt: Prompt): Promise<Outcome> {
  await isolate(worker);
  const base = {
    set: prompt.set,
    text: prompt.text,
    category: prompt.category,
    lang: prompt.lang,
    expectedUrgent: prompt.urgent,
  };
  const res = await fetch(`${url}/functions/v1/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${worker.token}` },
    body: JSON.stringify({ text: prompt.text, thread_id: worker.threadId, ...ZONE }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { ...base, status: res.status, escalation: null, error: String(body?.error ?? "unknown") };
  }
  return { ...base, status: res.status, escalation: body?.escalation ?? null };
}

const sets: SetName[] = only ? [only] : ["health", "nonhealth"];
const prompts = (await Promise.all(sets.map(loadFixture))).flat().slice(0, limit);
console.log(`prompts: ${prompts.length} (${sets.join(", ")})`);

const workers = await Promise.all(Array.from({ length: WORKERS }, (_, i) => seedWorker(i)));
const outcomes: Outcome[] = [];
let next = 0;
try {
  await Promise.all(workers.map(async (worker) => {
    while (next < prompts.length) {
      const prompt = prompts[next++];
      outcomes.push(await send(worker, prompt));
      if (outcomes.length % 25 === 0) console.log(`  ${outcomes.length}/${prompts.length}`);
    }
  }));
} finally {
  await admin.from("families").delete().in("id", workers.map((w) => w.familyId));
  for (const worker of workers) await admin.auth.admin.deleteUser(worker.userId);
}

const ok = outcomes.filter((o) => o.status === 200);
const errors = outcomes.filter((o) => o.status !== 200);
const health = ok.filter((o) => o.set === "health");
const nonhealth = ok.filter((o) => o.set === "nonhealth");
const misses = health.filter((o) => o.escalation === null);
const urgentExpected = health.filter((o) => o.expectedUrgent);
const urgentMissed = urgentExpected.filter((o) => o.escalation?.urgent !== true);
const falsePositives = nonhealth.filter((o) => o.escalation !== null);
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`);

const summary = {
  health_escalation_rate: pct(health.length - misses.length, health.length),
  health_total: health.length,
  health_misses: misses.length,
  urgent_agreement: pct(urgentExpected.length - urgentMissed.length, urgentExpected.length),
  urgent_total: urgentExpected.length,
  nonhealth_false_positive_rate: pct(falsePositives.length, nonhealth.length),
  nonhealth_total: nonhealth.length,
  nonhealth_false_positives: falsePositives.length,
  errors: errors.length,
};
console.log("\nSummary", summary);
const list = (title: string, items: Outcome[]) => {
  if (items.length === 0) return;
  console.log(`\n${title} (${items.length})`);
  for (const o of items) {
    console.log(`  [${o.category}/${o.lang}] ${o.text}${o.error ? `  -> ${o.status} ${o.error}` : ""}`);
  }
};
list("Health prompts with no escalation", misses);
list("Expected urgent, not urgent", urgentMissed);
list("Non-health prompts that escalated", falsePositives);
list("Errors", errors);

await Deno.mkdir("scripts/safety/out", { recursive: true });
await Deno.writeTextFile(
  OUT,
  JSON.stringify({ summary, misses, urgentMissed, falsePositives, errors, outcomes }, null, 2) + "\n",
);
console.log(`\nwrote ${OUT}`);
