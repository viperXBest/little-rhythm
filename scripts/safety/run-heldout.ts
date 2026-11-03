// Multi-turn held-out safety run against the LOCAL chat function (never hosted).
//
// run.ts sends every prompt on a clean thread. This runner sends hand-written sequences
// (scripts/safety/heldout/sequences.json) turn by turn on ONE thread, waiting for each
// answer, so the history builds up as in real use: a health question that only becomes one
// in context, a question split over two messages, a follow-up after a card, roleplay, and so
// on. Each turn says what it expects (card, reply, either); the evaluation is in
// heldout-eval.ts (pure, tested).
//
// Three workers, each with its own seeded user, family, baby and private thread. Before each
// sequence the worker deletes the thread's messages and memory; before each turn it resets
// the user's and family's rate-limit counts (the new-account cap is 10 turns). The runner also
// clears today's global breaker row on the local stack, as run.ts does.
//
// TRIGGER list: every sequence with a card turn that got no escalation (a 200 with no card),
// whatever the reply said. It is printed first and prominently, as ids and turn numbers only;
// no captions go to the console. A turn the server did not answer (429, 502 after one retry,
// timeout) is not a trigger: the sequence is "error", its later turns are not sent, and it can
// be rerun.
//
// Run from the repo root with the local stack up (`supabase start`):
//   eval "$(npx -y supabase@2.122.0 status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
//   SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
//     npx -y deno@2 run -A scripts/safety/run-heldout.ts [--limit N] [--only <category>] [--file <path>]
// Other modes:
//   --dry-run  validate the input and print the counts; no network, no env, no files written
//   --trace    one clean thread, the demo line, the full JSON response in
//              scripts/safety/out/trace.json (gitignored with scripts/safety/out/); no other flag
//
// Each turn costs two Muse calls (agent and classifier) on the real API, metered by the
// function's global breaker; the report gives the run's metered spend (assumed prices).
//
// Writes, next to each other in docs/safety-runs/ (UTC timestamp, e.g. 2026-11-03T1400Z):
//   <stamp>-heldout.json          totals per category and language, pass/fail per sequence,
//                                 every turn's result, commit, functions_dirty
//   <stamp>-heldout-replies.json  one outcome per answered turn in grade-replies.ts's input
//                                 format; grade the replies a parent saw with
//     npx -y deno@2 run --env-file=scripts/safety/.env --allow-env --allow-net --allow-read=. \
//       --allow-write=scripts/safety/out,docs/safety-runs scripts/safety/grade-replies.ts \
//       --report docs/safety-runs/<stamp>-heldout-replies.json
// Both files hold the turn texts and the model's replies (that is what the grader reads);
// they never hold ids, tokens, keys or env values. The console shows counts and status codes.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

import {
  countInput,
  DEMO_LINE,
  evaluateSequence,
  parseArgs,
  parseSequences,
  replyOutcomes,
  selectSequences,
  type Sequence,
  type SequenceFile,
  type SequenceRecord,
  summarize,
  toTurnResult,
  type TurnResult,
} from "./heldout-eval.ts";

const WORKERS = 3;
const RUNS_DIR = "docs/safety-runs";
const OUT_DIR = "scripts/safety/out";
const TRACE_OUT = `${OUT_DIR}/trace.json`;
const ZONE = { tz: "Europe/Bucharest", tz_offset_minutes: 120 };
/** The function's own limits are 30 s per Muse call; a turn that takes longer is hung. */
const TURN_TIMEOUT_MS = 150_000;
/** Access tokens last an hour; sign in again well before that. */
const REFRESH_AFTER_MS = 40 * 60_000;

const parsedArgs = parseArgs(Deno.args);
if (!parsedArgs.ok) {
  console.error(parsedArgs.error);
  Deno.exit(2);
}
const options = parsedArgs.options;

// ---------------------------------------------------------------------------
// Input and --dry-run (no network, no env)

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

let sequences: Sequence[] = [];
let input:
  | { path: string; sha256: string; version: 1; written_by: string | null; sequences_in_file: number }
  | null = null;

if (!options.trace) {
  let raw: string;
  try {
    raw = await Deno.readTextFile(options.file);
  } catch {
    console.error(`cannot read ${options.file}`);
    Deno.exit(2);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`${options.file} is not valid JSON`);
    Deno.exit(2);
  }
  const parsed = parseSequences(data);
  if (!parsed.ok) {
    console.error(`${options.file} is invalid (${parsed.errors.length} problem(s)):`);
    for (const e of parsed.errors) console.error(`  ${e}`);
    Deno.exit(2);
  }
  const file: SequenceFile = parsed.file;
  sequences = selectSequences(file.sequences, options);
  if (sequences.length === 0) {
    console.error(`no sequence left after --only ${options.only ?? "-"} --limit ${options.limit ?? "-"}`);
    Deno.exit(2);
  }
  input = {
    path: options.file,
    sha256: await sha256(raw),
    version: file.version,
    written_by: file.written_by?.slice(0, 80) ?? null,
    sequences_in_file: file.sequences.length,
  };

  const counts = countInput(sequences);
  console.log(
    `input ${input.path}: ${counts.sequences} sequences, ${counts.turns} turns ` +
      `(of ${input.sequences_in_file} sequences in the file; sha256 ${input.sha256.slice(0, 12)})`,
  );
  console.log(
    `turns: card ${counts.expects.card}, reply ${counts.expects.reply}, either ${counts.expects.either}; ` +
      `urgent checked on ${counts.urgent_checked} card turn(s)`,
  );
  for (const [category, row] of Object.entries(counts.by_category)) {
    console.log(`  ${category}: ${row.sequences} sequences, ${row.turns} turns`);
  }
  console.log(
    `languages: ${
      Object.entries(counts.by_lang).map(([lang, row]) => `${lang} ${row.sequences}`).join(", ")
    }`,
  );
  if (options.dryRun) {
    console.log("dry run: nothing sent, nothing written");
    Deno.exit(0);
  }
}

// ---------------------------------------------------------------------------
// From here on: the local stack

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
const { createClient } = await import("npm:@supabase/supabase-js@2.49.4");
const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Worker = {
  userId: string;
  token: string;
  familyId: string;
  threadId: string;
  email: string;
  password: string;
  signedInAt: number;
};

async function freshToken(worker: Worker): Promise<void> {
  if (Date.now() - worker.signedInAt < REFRESH_AFTER_MS) return;
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email: worker.email, password: worker.password });
  if (signIn.error) throw signIn.error;
  worker.token = signIn.data.session.access_token;
  worker.signedInAt = Date.now();
}

async function seedWorker(i: number): Promise<Worker> {
  const email = `safety-heldout-${i}-${crypto.randomUUID()}@test.local`;
  const password = crypto.randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("createUser failed");
  const userId = created.data.user.id;
  const family = await admin.from("families").insert({ created_by: userId }).select("id").single();
  if (family.error) throw family.error;
  const member = await admin.from("family_members").insert({ family_id: family.data.id, user_id: userId });
  if (member.error) throw member.error;
  // 20 weeks old: past the classifier's under-13-weeks fever rule, so that rule
  // fires only when a message states a younger age itself (as in run.ts).
  const birth = new Date(Date.now() - 140 * 86_400_000).toISOString().slice(0, 10);
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
    email,
    password,
    signedInAt: Date.now(),
  };
}

/** A clean thread: no messages, no memory (the start of a sequence), and no rate-limit count. */
async function cleanSlate(worker: Worker): Promise<void> {
  const messages = await admin.from("chat_messages").delete().eq("thread_id", worker.threadId);
  if (messages.error) throw messages.error;
  const memory = await admin.from("thread_memory").delete().eq("thread_id", worker.threadId);
  if (memory.error) throw memory.error;
  await resetCounts(worker);
}

/** The rate-limit counts only; the thread keeps its history (before every turn). */
async function resetCounts(worker: Worker): Promise<void> {
  const usage = await admin.from("api_usage").delete().eq("user_id", worker.userId);
  if (usage.error) throw usage.error;
  // The family's daily turn count (chat-limits.ts).
  const family = await admin.from("usage_counters").delete().eq("family_id", worker.familyId);
  if (family.error) throw family.error;
}

const dayStart = () => new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString();

/** Today's global chat spend in micro-USD as the breaker metered it (local stack only). */
async function globalSpend(): Promise<number> {
  const { data, error } = await admin.from("usage_counters").select("count")
    .eq("scope", "global").eq("function", "chat_spend")
    .eq("window_start", dayStart())
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.count) : 0;
}

/** Deletes today's global breaker row. Only ever runs against the local stack. */
async function resetGlobalSpend(): Promise<void> {
  const { error } = await admin.from("usage_counters").delete()
    .eq("scope", "global").eq("function", "chat_spend")
    .eq("window_start", dayStart());
  if (error) throw error;
}

async function cleanup(workers: Worker[]): Promise<void> {
  await admin.from("families").delete().in("id", workers.map((w) => w.familyId));
  for (const worker of workers) await admin.auth.admin.deleteUser(worker.userId);
}

/** One request on the worker's thread, history kept. status 0 is a network error or a timeout. */
async function post(
  worker: Worker,
  text: string,
): Promise<{ status: number; body: unknown; error?: string }> {
  await resetCounts(worker);
  await freshToken(worker);
  let res: Response;
  try {
    res = await fetch(`${url}/functions/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${worker.token}`,
      },
      body: JSON.stringify({ text, thread_id: worker.threadId, ...ZONE }),
      signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
    });
  } catch (e) {
    return {
      status: 0,
      body: null,
      error: e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : "network",
    };
  }
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

let retried = 0;

/**
 * A 502 (local edge runtime or upstream hiccup) gets one retry before it counts as an error.
 * Nothing is stored on a 502, so the retry sends the same turn on the same history.
 */
async function sendTurn(worker: Worker, text: string): Promise<TurnResult> {
  let res = await post(worker, text);
  if (res.status === 502) {
    retried++;
    res = await post(worker, text);
  }
  const result = toTurnResult(res.status, res.body);
  return res.error ? { ...result, error: res.error } : result;
}

async function runSequence(worker: Worker, seq: Sequence): Promise<SequenceRecord> {
  await cleanSlate(worker);
  const results: (TurnResult | null)[] = [];
  for (const turn of seq.turns) {
    const result = await sendTurn(worker, turn.text);
    results.push(result);
    // An unanswered turn leaves a hole in the history: the rest would test something else.
    if (result.status !== 200) break;
  }
  while (results.length < seq.turns.length) results.push(null);
  return evaluateSequence(seq, results);
}

const git = async (...args: string[]) =>
  new TextDecoder().decode((await new Deno.Command("git", { args }).output()).stdout).trim();

// ---------------------------------------------------------------------------
// --trace: the demo line on one clean thread, the full response written to a gitignored file

async function trace(): Promise<void> {
  await resetGlobalSpend();
  const worker = await seedWorker(0);
  try {
    await cleanSlate(worker);
    const res = await post(worker, DEMO_LINE);
    const body = res.body ?? { status: res.status, error: res.error ?? "non_json_response" };
    await Deno.mkdir(OUT_DIR, { recursive: true });
    await Deno.writeTextFile(TRACE_OUT, JSON.stringify(body, null, 2) + "\n");
    const result = toTurnResult(res.status, res.body);
    console.log(
      `trace: status ${res.status}, escalated ${result.escalated}, proposals ${result.proposals}, ` +
        `steps ${result.steps?.length ?? 0}${result.error ? `, error ${result.error}` : ""}`,
    );
    console.log(`wrote ${TRACE_OUT} (gitignored)`);
  } finally {
    await cleanup([worker]);
  }
}

// ---------------------------------------------------------------------------
// The run

async function uniqueStamp(startedAt: Date): Promise<string> {
  const stamp = startedAt.toISOString().slice(0, 16).replace(":", "") + "Z";
  for (let n = 1;; n++) {
    const base = n === 1 ? `${RUNS_DIR}/${stamp}-heldout` : `${RUNS_DIR}/${stamp}-heldout-${n}`;
    try {
      await Deno.stat(`${base}.json`);
    } catch {
      return base;
    }
  }
}

async function main(): Promise<void> {
  const runStart = Date.now();
  console.log(`sequences: ${sequences.length} (${sequences.reduce((n, s) => n + s.turns.length, 0)} turns)`);

  // The global breaker counts this run too; clear today's row first (local stack only,
  // checked above) so an earlier run the same day can't make this one 429.
  await resetGlobalSpend();
  const spendBefore = await globalSpend();
  const workers = await Promise.all(Array.from({ length: WORKERS }, (_, i) => seedWorker(i)));
  const records: SequenceRecord[] = new Array(sequences.length);
  let next = 0;
  let done = 0;
  try {
    await Promise.all(workers.map(async (worker) => {
      while (next < sequences.length) {
        const i = next++;
        records[i] = await runSequence(worker, sequences[i]);
        done++;
        if (done % 10 === 0) console.log(`  ${done}/${sequences.length}`);
      }
    }));
  } finally {
    await cleanup(workers);
  }

  // Settles land after each response: give the last ones a moment.
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  const meteredUsd = (await globalSpend() - spendBefore) / 1_000_000;
  const summary = summarize(records);

  const startedAt = new Date(runStart);
  const meta = {
    started_at: startedAt.toISOString(),
    commit: await git("rev-parse", "--short", "HEAD"),
    // Uncommitted changes under supabase/functions at run time: then the commit alone doesn't describe the code.
    functions_dirty: (await git("status", "--porcelain", "--", "supabase/functions")) !== "",
    input,
    selection: { only: options.only, limit: options.limit },
    models: { agent: "muse-spark-1.3", classifier: "muse-spark-1.3" },
    stack: "local",
    workers: WORKERS,
    retried_502: retried,
    // At the assumed prices in supabase/functions/_shared/chat-limits.ts.
    metered_spend_usd: Number(meteredUsd.toFixed(4)),
  };
  const base = await uniqueStamp(startedAt);
  const reportPath = `${base}.json`;
  const repliesPath = `${base}-replies.json`;
  await Deno.mkdir(RUNS_DIR, { recursive: true });
  await Deno.writeTextFile(
    reportPath,
    JSON.stringify({ meta, summary, sequences: records }, null, 2) + "\n",
  );
  // grade-replies.ts reads `meta.commit` and `outcomes`.
  await Deno.writeTextFile(
    repliesPath,
    JSON.stringify(
      { meta: { ...meta, kind: "heldout-replies", report: reportPath }, outcomes: replyOutcomes(records) },
      null,
      2,
    ) +
      "\n",
  );

  // Console: counts, ids and status codes only. No texts, no captions.
  const t = summary.total;
  const bar = "=".repeat(64);
  console.log(`\n${bar}`);
  console.log(`TRIGGERS: ${t.triggered} of ${t.sequences} sequences (a card turn got no escalation)`);
  for (const trig of summary.triggers) console.log(`  ${trig.id}  (turn ${trig.turns.join(", ")})`);
  console.log(bar);
  console.log(
    `sequences: ${t.passed} passed, ${t.failed} failed, ${t.errored} errored (of ${t.sequences}); ` +
      `turns: ${t.turns_passed} passed, ${t.turns_failed} failed, ${t.turns_unanswered} unanswered (of ${t.turns})`,
  );
  const row = (name: string, x: typeof t) =>
    `  ${name}: ${x.passed}/${x.sequences} passed, ${x.failed} failed, ${x.errored} errored, ${x.triggered} triggered`;
  console.log("by category");
  for (const [name, x] of Object.entries(summary.by_category)) console.log(row(name, x));
  console.log("by language");
  for (const [name, x] of Object.entries(summary.by_lang)) console.log(row(name, x));
  console.log(
    `either turns: ${summary.either_turns.total}, ${summary.either_turns.escalated} escalated; ` +
      `retried 502: ${retried}; metered spend $${meta.metered_spend_usd}; functions_dirty ${meta.functions_dirty}`,
  );
  if (summary.failed_ids.length > 0) {
    console.log(`\nFailed sequences (${summary.failed_ids.length}); reasons per turn:`);
    for (const r of records.filter((x) => x.status === "fail")) {
      const why = r.turns.filter((x) => !x.pass && x.result?.status === 200)
        .map((x) => `turn ${x.n} ${x.reason}${x.leaks ? ` [${x.leaks.join(",")}]` : ""}`).join("; ");
      console.log(`  ${r.id}: ${why}`);
    }
  }
  if (summary.errored_ids.length > 0) {
    console.log(`\nErrored sequences (${summary.errored_ids.length}), not judged; rerun them:`);
    for (const r of records.filter((x) => x.status === "error")) {
      const codes = r.turns.filter((x) => x.result !== null && x.result.status !== 200)
        .map((x) => `turn ${x.n} -> ${x.result?.status} ${x.result?.error ?? ""}`.trim()).join("; ");
      console.log(`  ${r.id}: ${codes}`);
    }
  }
  console.log(`\nwrote ${reportPath} and ${repliesPath}`);
  if (t.failed > 0 || t.errored > 0) Deno.exitCode = 1;
}

if (options.trace) await trace();
else await main();
