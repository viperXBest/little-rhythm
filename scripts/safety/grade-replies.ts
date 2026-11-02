// Grades the model's replies in a committed safety-run report (no chat calls):
// the gate's keyword list plus Muse Spark Open as a grader (see grade.ts).
// The safety set already proves health questions escalate; this measures whether the
// replies that did reach a parent stay clear of health advice and age norms.
//
// Config: scripts/safety/.env (gitignored; see .env.example):
//   SAFETY_GEN_BASE_URL  SAFETY_GEN_API_KEY  SAFETY_GEN_MODEL
//
// Run from the repo root:
//   npx -y deno@2 run --env-file=scripts/safety/.env --allow-env --allow-net --allow-read=. \
//     --allow-write=scripts/safety/out,docs/safety-runs scripts/safety/grade-replies.ts \
//     --report docs/safety-runs/<run>.json
//
// Writes scripts/safety/out/replies.json and a dated copy next to the report
// (docs/safety-runs/<run>.replies.json). The replies are model output to public fixture
// prompts and are already in the committed report. Logs counts and status codes, never the key.

import {
  type Grade,
  graderMessages,
  keywordFlag,
  type Outcome,
  parseGrade,
  replyCandidates,
} from "./grade.ts";

const TIMEOUT_MS = 120_000;
const CONCURRENCY = 4;

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`missing ${name} (scripts/safety/.env)`);
  return value;
}

const reportPath = Deno.args.find((_, i) => Deno.args[i - 1] === "--report");
if (
  !reportPath || !/^docs\/safety-runs\/[\w.+-]+\.json$/.test(reportPath) ||
  reportPath.endsWith(".replies.json")
) {
  throw new Error("pass --report docs/safety-runs/<run>.json");
}
const baseUrl = env("SAFETY_GEN_BASE_URL").replace(/\/+$/, "");
const apiKey = env("SAFETY_GEN_API_KEY");
const model = env("SAFETY_GEN_MODEL");

async function grade(parent: string, reply: string, label: string): Promise<Grade | null> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: graderMessages(parent, reply),
          temperature: 0,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      console.error(`  ${label}: network error or timeout, attempt ${attempt}`);
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      console.error(`  ${label}: HTTP ${res.status}, attempt ${attempt}`);
      continue;
    }
    const body = await res.json().catch(() => null);
    const content: unknown = body?.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? parseGrade(content) : null;
    if (parsed) return parsed;
    console.error(`  ${label}: unparseable output, attempt ${attempt}`);
  }
  return null;
}

const report = JSON.parse(await Deno.readTextFile(reportPath)) as {
  meta?: { commit?: string };
  outcomes: Outcome[];
};
const replies = replyCandidates(report.outcomes);
console.log(`${reportPath}: ${report.outcomes.length} outcomes, ${replies.length} replies to grade`);

type Graded = {
  set: string;
  category?: string;
  lang?: string;
  text: string;
  caption: string;
  keyword: boolean;
  grade: Grade | null;
};
const graded: Graded[] = new Array(replies.length);
let next = 0;
async function worker() {
  while (next < replies.length) {
    const i = next++;
    const o = replies[i];
    graded[i] = {
      set: o.set,
      category: o.category,
      lang: o.lang,
      text: o.text,
      caption: o.caption,
      keyword: keywordFlag(o.caption),
      grade: await grade(o.text, o.caption, `reply ${i + 1}/${replies.length}`),
    };
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const count = (f: (g: Graded) => boolean) => graded.filter(f).length;
const bySet: Record<string, Record<string, number>> = {};
for (const g of graded) {
  const row = bySet[g.set] ??= { replies: 0, ok: 0, borderline: 0, advice: 0, ungraded: 0, keyword: 0 };
  row.replies++;
  row[g.grade?.verdict ?? "ungraded"]++;
  if (g.keyword) row.keyword++;
}
const summary = {
  replies: graded.length,
  advice: count((g) => g.grade?.verdict === "advice"),
  borderline: count((g) => g.grade?.verdict === "borderline"),
  ok: count((g) => g.grade?.verdict === "ok"),
  ungraded: count((g) => g.grade === null),
  keyword_hits: count((g) => g.keyword),
  by_set: bySet,
};
const out = {
  meta: {
    report: reportPath,
    report_commit: report.meta?.commit ?? null,
    graded_at: new Date().toISOString(),
    grader: "Muse Spark Open (SAFETY_GEN_MODEL), temperature 0, rubric in scripts/safety/grade.ts",
  },
  summary,
  flagged: graded.filter((g) => g.keyword || (g.grade && g.grade.verdict !== "ok")),
  ungraded: graded.filter((g) => g.grade === null).map((g) => g.text),
};

const json = JSON.stringify(out, null, 2) + "\n";
await Deno.mkdir("scripts/safety/out", { recursive: true });
await Deno.writeTextFile("scripts/safety/out/replies.json", json);
const dated = reportPath.replace(/\.json$/, ".replies.json");
await Deno.writeTextFile(dated, json);

console.log(
  `advice ${summary.advice}, borderline ${summary.borderline}, ok ${summary.ok}, ungraded ${summary.ungraded}; ` +
    `keyword hits ${summary.keyword_hits}`,
);
for (const [set, row] of Object.entries(bySet)) console.log(`  ${set}: ${JSON.stringify(row)}`);
console.log(`wrote scripts/safety/out/replies.json and ${dated}`);
