// Independent review with Muse Spark Open through any OpenAI-compatible endpoint
// (the same one as the safety generator). Two passes over the files in git:
//   1. security: a security audit in batches, then one merge pass that dedupes and ranks;
//   2. judge: the repo and README scored against the hackathon rubric.
// Output goes to scripts/review/out/ (gitignored). Findings are triaged by a human
// before anything is fixed.
//
// Config: scripts/safety/.env (gitignored; see scripts/safety/.env.example):
//   SAFETY_GEN_BASE_URL  SAFETY_GEN_API_KEY  SAFETY_GEN_MODEL
// Optional: REVIEW_MAX_CHARS (characters of source per request, default 120000).
//
// Run from the repo root:
//   npx -y deno@2 run --env-file=scripts/safety/.env --allow-env --allow-net --allow-run=git \
//     --allow-read=. --allow-write=scripts/review/out scripts/review/review.ts [--pass security|judge] [--dry-run]
//
// Logs counts and status codes only, never the key or file contents.

type Severity = "high" | "medium" | "low" | "info";
type Finding = {
  severity: Severity;
  file: string;
  line: number | null;
  title: string;
  issue: string;
  exploit?: string;
  fix: string;
  location_checked?: "ok" | "file_not_found" | "line_out_of_range" | "no_line";
};
type SourceFile = { path: string; text: string; lines: number };

const OUT_DIR = "scripts/review/out";
const TIMEOUT_MS = 300_000;
const MAX_CHARS = Number(Deno.env.get("REVIEW_MAX_CHARS") ?? 120_000);

const args = new Set(Deno.args);
const only = Deno.args.find((a, i) => Deno.args[i - 1] === "--pass");
const dryRun = args.has("--dry-run");

// ---------------------------------------------------------------------------
// Files: everything in git except lockfiles, binaries, env files and fixtures
// ---------------------------------------------------------------------------

const SKIP = [
  /(^|\/)(package-lock\.json|deno\.lock|yarn\.lock|pnpm-lock\.yaml)$/,
  /\.(png|jpe?g|gif|webp|ico|svg|ttf|otf|woff2?|mp3|wav|m4a|aac|jks|keystore|pdf|zip|gz)$/i,
  /(^|\/)\.env(\..*)?$/,
  /(^|\/)LICENSE$/,
  // Fixtures and generated files.
  /^supabase\/functions\/chat\/safety-[a-z]+\.json$/,
  /^supabase\/functions\/_shared\/predict\.fixtures\.ts$/,
  /^app\/src\/lib\/database\.types\.ts$/,
];

async function trackedFiles(): Promise<SourceFile[]> {
  const out = await new Deno.Command("git", { args: ["ls-files", "-z"], stdout: "piped" }).output();
  if (!out.success) throw new Error("git ls-files failed");
  const paths = new TextDecoder().decode(out.stdout).split("\0").filter(Boolean);
  const files: SourceFile[] = [];
  for (const path of paths) {
    if (SKIP.some((re) => re.test(path))) continue;
    const bytes = await Deno.readFile(path);
    if (bytes.includes(0)) continue; // binary
    const text = new TextDecoder().decode(bytes).replace(/\r\n/g, "\n");
    files.push({ path, text, lines: text.split("\n").length });
  }
  return files;
}

function numbered(file: SourceFile): string {
  const body = file.text.split("\n").map((l, i) => `${String(i + 1).padStart(4)}| ${l}`).join("\n");
  return `=== FILE: ${file.path} (${file.lines} lines) ===\n${body}\n`;
}

/** Packs files into batches under MAX_CHARS; a larger file is split into line ranges. */
function batches(files: SourceFile[]): string[] {
  const chunks: string[] = [];
  for (const file of files) {
    const text = numbered(file);
    if (text.length <= MAX_CHARS) {
      chunks.push(text);
      continue;
    }
    const lines = text.split("\n");
    let part: string[] = [];
    for (const line of lines) {
      if ((part.join("\n").length + line.length) > MAX_CHARS - 200) {
        chunks.push(`(continued) ${file.path}\n${part.join("\n")}\n`);
        part = [];
      }
      part.push(line);
    }
    if (part.length) chunks.push(`(continued) ${file.path}\n${part.join("\n")}\n`);
  }
  const out: string[] = [];
  let current = "";
  for (const chunk of chunks) {
    if (current && current.length + chunk.length > MAX_CHARS) {
      out.push(current);
      current = "";
    }
    current += chunk;
  }
  if (current) out.push(current);
  return out;
}

// ---------------------------------------------------------------------------
// Model calls
// ---------------------------------------------------------------------------

function config() {
  const baseUrl = Deno.env.get("SAFETY_GEN_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("SAFETY_GEN_API_KEY");
  const model = Deno.env.get("SAFETY_GEN_MODEL");
  if (!baseUrl || !apiKey || !model) {
    throw new Error("set SAFETY_GEN_BASE_URL, SAFETY_GEN_API_KEY, SAFETY_GEN_MODEL");
  }
  return { baseUrl, apiKey, model };
}

async function complete(system: string, user: string, label: string): Promise<unknown | null> {
  const { baseUrl, apiKey, model } = config();
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          temperature: 0.2,
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
    const parsed = typeof content === "string" ? parseJson(content) : null;
    if (parsed) return parsed;
    console.error(`  ${label}: unparseable output, attempt ${attempt}`);
  }
  return null;
}

function parseJson(content: string): unknown | null {
  // Some open models wrap JSON in prose, a code fence or a reasoning block.
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

const SEVERITIES: Severity[] = ["high", "medium", "low", "info"];

function asFindings(data: unknown): Finding[] {
  const list = (data as { findings?: unknown })?.findings;
  if (!Array.isArray(list)) return [];
  return list.flatMap((f): Finding[] => {
    if (!f || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    const severity = SEVERITIES.includes(o.severity as Severity) ? (o.severity as Severity) : "info";
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const file = str(o.file, 300);
    const title = str(o.title, 200);
    if (!file || !title) return [];
    const line = Number.isInteger(o.line) ? (o.line as number) : null;
    return [{
      severity,
      file,
      line,
      title,
      issue: str(o.issue, 2000),
      exploit: str(o.exploit, 2000) || undefined,
      fix: str(o.fix, 2000),
    }];
  });
}

/** Marks each finding whose file or line doesn't exist, so hallucinated locations stand out. */
function checkLocations(findings: Finding[], files: SourceFile[]): Finding[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  return findings.map((f) => {
    const file = byPath.get(f.file.replace(/^\.?\//, ""));
    const location_checked = !file
      ? "file_not_found"
      : f.line === null
      ? "no_line"
      : f.line < 1 || f.line > file.lines
      ? "line_out_of_range"
      : "ok";
    return { ...f, location_checked };
  });
}

// ---------------------------------------------------------------------------
// Pass 1: security audit
// ---------------------------------------------------------------------------

const SECURITY_SYSTEM = `You are a senior application security engineer auditing a public repository.
The project: an Android app (Expo, React Native) where two parents share one baby's log. Backend is
Supabase: Postgres with row-level security (every row hangs off a family; is_family_member() guards it),
Auth, Realtime, and Deno Edge Functions (chat, predict, pair, delete-account). The chat function runs an
LLM tool-calling agent; the baby and family must come from the session, never from the model or the
request body. Private chat threads must be readable only by their owner. Edge Functions use the service
role only after verifying the caller's JWT. Health questions must get only an escalation card, never
model text. Secrets must never be in the repo or in logs.

Audit ONLY the files given. Report concrete, exploitable issues: authorization or RLS bypass, IDOR across
families or into the partner's private thread, privilege escalation through SECURITY DEFINER functions or
grants, injection, secrets in code, logging of user content or credentials, unsafe handling of model
output, missing validation that leads to a real exploit, and CI/workflow risks with a concrete trigger.
Do not report style, missing comments, or hardening that has no concrete exploit. Use the line numbers
shown at the start of each line ("  42| code" is line 42). If nothing qualifies, return an empty list.

Answer with JSON only:
{"findings":[{"severity":"high|medium|low|info","file":"path/as/shown","line":42,"title":"...",
"issue":"what is wrong","exploit":"step-by-step attack, or empty","fix":"concrete fix"}]}`;

const MERGE_SYSTEM = `You merge security findings from several batches of the same repository audit.
Remove duplicates (keep the most precise file and line), drop findings that are not concrete security
issues, and order by severity (high, medium, low, info). Do not invent new findings and do not change
file paths or line numbers. Answer with JSON only: {"findings":[...same shape as the input...]}`;

async function securityPass(files: SourceFile[]): Promise<Finding[]> {
  const parts = batches(files);
  console.log(`security: ${files.length} files in ${parts.length} batches (<= ${MAX_CHARS} chars each)`);
  if (dryRun) return [];
  const raw: Finding[] = [];
  for (const [i, part] of parts.entries()) {
    const data = await complete(SECURITY_SYSTEM, part, `security batch ${i + 1}/${parts.length}`);
    const found = asFindings(data);
    console.log(`  batch ${i + 1}/${parts.length}: ${data ? found.length + " findings" : "failed"}`);
    raw.push(...found);
  }
  await Deno.writeTextFile(
    `${OUT_DIR}/security-raw.json`,
    JSON.stringify(checkLocations(raw, files), null, 2),
  );

  let merged = raw;
  if (raw.length > 1) {
    const data = await complete(MERGE_SYSTEM, JSON.stringify({ findings: raw }), "security merge");
    const out = asFindings(data);
    // Keep the raw list if the merge failed or dropped everything.
    merged = data && out.length ? out : raw;
    console.log(`  merge: ${raw.length} -> ${merged.length}${data ? "" : " (merge failed, kept raw)"}`);
  }
  const checked = checkLocations(merged, files)
    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity));
  await Deno.writeTextFile(`${OUT_DIR}/security.json`, JSON.stringify(checked, null, 2));
  await Deno.writeTextFile(`${OUT_DIR}/security.md`, securityMarkdown(checked));
  return checked;
}

function securityMarkdown(findings: Finding[]): string {
  const lines = ["# Security audit (Muse Spark Open)", ""];
  for (const severity of SEVERITIES) {
    const group = findings.filter((f) => f.severity === severity);
    lines.push(`## ${severity} (${group.length})`, "");
    for (const f of group) {
      const where = `${f.file}${f.line ? `:${f.line}` : ""}`;
      lines.push(`### ${f.title}`, "", `- **Where:** \`${where}\` (location ${f.location_checked})`);
      lines.push(`- **Issue:** ${f.issue}`);
      if (f.exploit) lines.push(`- **Exploit:** ${f.exploit}`);
      lines.push(`- **Fix:** ${f.fix}`, "");
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Pass 2: judge against the rubric
// ---------------------------------------------------------------------------

const RUBRIC = [
  { key: "impact", label: "Impact", weight: 0.3 },
  { key: "meta_ai", label: "Use of Meta AI tooling", weight: 0.25 },
  { key: "technical_depth", label: "Technical depth", weight: 0.2 },
  { key: "demo", label: "Demo", weight: 0.25 },
] as const;

const JUDGE_SYSTEM = `You are a judge at the Meta Global AI Developer Hackathon (Indie Developer track).
Score this submission from its repository and README against the rubric:
- Impact (30%): real problem, real users, would people use it.
- Use of Meta AI tooling (25%): how well and how visibly it uses Meta's models (here Muse Spark 1.3 as a
  tool-calling agent and Muse Voice Transcribe), beyond a thin wrapper.
- Technical depth (20%): architecture, security, testing, engineering quality.
- Demo (25%): judged from the README and the demo script in the docs: is it clear what a 3-minute demo
  shows, is the "wow" visible, can a judge understand it quickly.
Listed anti-project: AI that gives medical advice (disqualifying). Check the README makes the safety
design clear. Be specific and critical; cite files. Score each criterion 1-10.

Answer with JSON only:
{"scores":{"impact":{"score":7,"rationale":"...","improvements":["..."]},"meta_ai":{...},
"technical_depth":{...},"demo":{...}},"strengths":["..."],"risks":["..."],
"readme_gaps":["what a judge looks for in the README and can't find"]}`;

const JUDGE_CORE = [
  "supabase/functions/chat/index.ts",
  "supabase/functions/_shared/agent.ts",
  "supabase/functions/_shared/health-gate.ts",
  "supabase/functions/_shared/predict.ts",
  "app/src/app/(app)/chat.tsx",
];

async function judgePass(files: SourceFile[]): Promise<void> {
  const docs = files.filter((f) => /^(README\.md|SECURITY\.md|CLAUDE\.md|docs\/.*\.md)$/.test(f.path));
  const core = files.filter((f) => JUDGE_CORE.includes(f.path));
  const tree = files.map((f) => `${f.path} (${f.lines} lines)`).join("\n");
  let user = `FILE TREE (tracked files reviewed):\n${tree}\n\n`;
  for (const f of [...docs, ...core]) {
    const block = numbered(f);
    if (user.length + block.length > MAX_CHARS) {
      console.log(`  judge: budget reached, skipped ${f.path}`);
      continue;
    }
    user += block;
  }
  console.log(`judge: ${docs.length} docs + ${core.length} core files, ${user.length} chars`);
  if (dryRun) return;
  const data = await complete(JUDGE_SYSTEM, user, "judge") as Record<string, unknown> | null;
  if (!data) {
    console.error("judge: failed");
    return;
  }
  const scores = (data.scores ?? {}) as Record<string, { score?: number }>;
  const weighted = RUBRIC.reduce((sum, r) => sum + (Number(scores[r.key]?.score) || 0) * r.weight, 0);
  const result = { ...data, weighted_total: Math.round(weighted * 100) / 100 };
  await Deno.writeTextFile(`${OUT_DIR}/judge.json`, JSON.stringify(result, null, 2));
  console.log(`  judge: weighted ${result.weighted_total}/10`);
}

// ---------------------------------------------------------------------------

await Deno.mkdir(OUT_DIR, { recursive: true });
const files = await trackedFiles();
console.log(`files: ${files.length} after skipping lockfiles, binaries, env files and fixtures`);
if (!only || only === "security") {
  const findings = await securityPass(files);
  if (!dryRun) {
    const counts = SEVERITIES.map((s) => `${s}=${findings.filter((f) => f.severity === s).length}`);
    console.log(`security: ${counts.join(" ")}`);
  }
}
if (!only || only === "judge") await judgePass(files);
