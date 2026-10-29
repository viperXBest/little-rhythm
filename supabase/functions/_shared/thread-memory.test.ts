import { assertEquals } from "jsr:@std/assert@1.0.13";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

import type { Message } from "./agent.ts";
import { HISTORY_LIMIT } from "./buddy-context.ts";
import { readFoldMessages, writeThreadMemory } from "./chat-data.ts";
import {
  checkSummary,
  EMPTY_SUMMARY,
  FOLD_THRESHOLD,
  foldBatch,
  type FoldMessage,
  maybeFoldMemory,
  type MemoryDeps,
  type MemoryRow,
  STRICTER_INSTRUCTION,
  SUMMARIZER_PROMPT,
  summarizerMessages,
} from "./thread-memory.ts";

const THREAD = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

function rows(n: number, extra: (i: number) => Partial<FoldMessage> = () => ({})): FoldMessage[] {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `message ${i}`,
    escalation: null,
    proposal_summary: null,
    gated: false,
    created_at: new Date(Date.UTC(2026, 9, 28, 8, i)).toISOString(),
    ...extra(i),
  }));
}

/** Fake dependencies that record what was written and what the model was sent. */
function fakeDeps(input: {
  previous?: MemoryRow | null;
  messages: FoldMessage[];
  drafts: (string | null)[];
  names?: string[];
}) {
  const sent: Message[][] = [];
  const written: { next: MemoryRow; previous: MemoryRow | null }[] = [];
  const since: (string | null)[] = [];
  const deps: MemoryDeps = {
    readMemory: () => Promise.resolve(input.previous ?? null),
    readSince: (s) => {
      since.push(s);
      return Promise.resolve(input.messages);
    },
    readNames: () => Promise.resolve(input.names ?? []),
    summarize: (messages) => {
      sent.push(messages);
      return Promise.resolve(input.drafts.shift() ?? null);
    },
    write: (next, previous) => {
      written.push({ next, previous });
      return Promise.resolve();
    },
  };
  return { deps, sent, written, since };
}

Deno.test("fold only when more than 20 usable messages sit outside the 30-message window", () => {
  assertEquals(foldBatch(rows(HISTORY_LIMIT + FOLD_THRESHOLD)), null);
  const batch = foldBatch(rows(HISTORY_LIMIT + FOLD_THRESHOLD + 1));
  assertEquals(batch?.length, FOLD_THRESHOLD + 1);
  assertEquals(batch?.[0].content, "message 0");
  // Gated and escalation rows don't count and are never folded.
  const mixed = rows(
    HISTORY_LIMIT + FOLD_THRESHOLD + 5,
    (i) => i < 5 ? (i % 2 === 0 ? { gated: true } : { escalation: "health", content: null }) : {},
  );
  assertEquals(foldBatch(mixed), null);
});

Deno.test("summarizer input: no gated or escalation rows, no authors or ids, and the fixed prompt", () => {
  const batch = rows(4, (i) => (i === 1 ? { gated: true, content: "how much calpol?" } : {}));
  batch.push({ ...rows(1)[0], role: "assistant", content: null, escalation: "health" });
  const [system, user] = summarizerMessages("Bath at 19:00.", batch, false);
  assertEquals(system, { role: "system", content: SUMMARIZER_PROMPT });
  assertEquals(
    user.content,
    "Current memory:\n<<<\nBath at 19:00.\n>>>\nOlder messages, oldest first:\n<<<\nparent: message 0\nparent: message 2\nassistant: message 3\n>>>",
  );
  assertEquals(String(user.content).includes("calpol"), false);
  assertEquals(String(summarizerMessages(null, batch, true)[0].content).endsWith(STRICTER_INSTRUCTION), true);
});

Deno.test("summary check: health words, emails, ids and family names are rejected", () => {
  const names = ["Mara", "Andrei", "Parent", "Al"];
  assertEquals(checkSummary("Bath at 19:00 with songs. Dad takes the 2am shift.", names).ok, true);
  assertEquals(checkSummary("She had a fever on Tuesday.", names), { ok: false, reason: "health" });
  assertEquals(checkSummary("Mom gave paracetamol at night.", names), { ok: false, reason: "health" });
  assertEquals(checkSummary("Write to mom@example.com", names), { ok: false, reason: "email" });
  assertEquals(checkSummary("thread aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa", names), {
    ok: false,
    reason: "id",
  });
  assertEquals(checkSummary("Mara loves the bath.", names), { ok: false, reason: "name" });
  assertEquals(checkSummary("ANDREI takes nights.", names), { ok: false, reason: "name" });
  // The default display name and very short names don't block ordinary words.
  assertEquals(checkSummary("Each parent takes one night; also a walk.", names).ok, true);
  assertEquals(checkSummary("   ", names), { ok: false, reason: "empty" });
  assertEquals(checkSummary("x".repeat(4001), names), { ok: false, reason: "too_long" });
});

Deno.test("a draft with health content is retried once with the stricter instruction", async () => {
  const messages = rows(HISTORY_LIMIT + FOLD_THRESHOLD + 1);
  const fake = fakeDeps({
    previous: { summary: "Bath at 19:00.", covered_until: "2026-10-27T00:00:00.000Z" },
    messages,
    drafts: ["She had a fever after the walk.", "Bath at 19:00. Walks in the park after lunch."],
  });
  assertEquals(await maybeFoldMemory(fake.deps), "updated");
  assertEquals(fake.since, ["2026-10-27T00:00:00.000Z"]);
  assertEquals(fake.sent.length, 2);
  assertEquals(String(fake.sent[1][0].content).endsWith(STRICTER_INSTRUCTION), true);
  assertEquals(fake.written, [{
    next: {
      summary: "Bath at 19:00. Walks in the park after lunch.",
      covered_until: messages[FOLD_THRESHOLD].created_at,
    },
    previous: { summary: "Bath at 19:00.", covered_until: "2026-10-27T00:00:00.000Z" },
  }]);
});

Deno.test("two bad drafts: the old summary is kept and covered_until still advances", async () => {
  const messages = rows(HISTORY_LIMIT + FOLD_THRESHOLD + 3);
  const previous = { summary: "Bath at 19:00.", covered_until: "2026-10-27T00:00:00.000Z" };
  const fake = fakeDeps({
    previous,
    messages,
    drafts: ["Mara had a rash.", "Mara likes the park."],
    names: ["Mara"],
  });
  assertEquals(await maybeFoldMemory(fake.deps), "kept_old");
  assertEquals(fake.written, [{
    next: { summary: "Bath at 19:00.", covered_until: messages[FOLD_THRESHOLD + 2].created_at },
    previous,
  }]);

  const first = fakeDeps({ messages, drafts: ["fever", "fever again"] });
  assertEquals(await maybeFoldMemory(first.deps), "kept_old");
  assertEquals(first.written[0].next.summary, EMPTY_SUMMARY);
});

Deno.test("nothing to fold: no model call, no write", async () => {
  const fake = fakeDeps({ messages: rows(HISTORY_LIMIT + 5), drafts: ["unused"] });
  assertEquals(await maybeFoldMemory(fake.deps), "skipped");
  assertEquals([fake.sent.length, fake.written.length], [0, 0]);
});

Deno.test("fold query: this thread, usable rows only, after covered_until, oldest first", async () => {
  const db = recordingDb([]);
  await readFoldMessages(db.client, THREAD, "2026-10-27T00:00:00.000Z", 200);
  const calls = db.calls.map((c) => [c.method, ...c.args]);
  for (
    const expected of [
      ["eq", "thread_id", THREAD],
      ["eq", "gated", false],
      ["is", "escalation", null],
      ["gt", "created_at", "2026-10-27T00:00:00.000Z"],
      ["order", "created_at", { ascending: true }],
      ["limit", 200],
    ]
  ) {
    assertEquals(
      calls.some((c) => JSON.stringify(c) === JSON.stringify(expected)),
      true,
      JSON.stringify(expected),
    );
  }
  const select = String(db.calls.find((c) => c.method === "select")?.args[0]);
  assertEquals(/author|\bid\b/.test(select), false);
});

Deno.test("memory write: first fold inserts, later folds update only if covered_until is unchanged", async () => {
  const first = recordingDb([]);
  await writeThreadMemory(first.client, THREAD, { summary: "s", covered_until: "t1" }, null);
  assertEquals(first.calls.some((c) => c.method === "upsert"), true);
  const later = recordingDb([]);
  await writeThreadMemory(later.client, THREAD, { summary: "s2", covered_until: "t2" }, {
    summary: "s",
    covered_until: "t1",
  });
  const calls = later.calls.map((c) => [c.method, ...c.args]);
  assertEquals(calls.some((c) => c[0] === "eq" && c[1] === "covered_until" && c[2] === "t1"), true);
  assertEquals(calls.some((c) => c[0] === "eq" && c[1] === "thread_id" && c[2] === THREAD), true);
});

/** A stand-in for supabase-js's query builder: records every call, resolves with `rows`. */
function recordingDb(result: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const proxy: unknown = new Proxy({}, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void) => resolve({ data: result, error: null });
      }
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  });
  return { client: proxy as SupabaseClient, calls };
}
