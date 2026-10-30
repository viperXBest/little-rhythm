// Creates or resets the demo family: two paired parents (Ana and Radu) and Maia,
// 13 weeks old, with three weeks of events ending just before the recording
// (plan.ts). Runs from the developer's PC only, never in CI against hosted.
//
//   npx -y deno@2 run --env-file=scripts/seed-demo/.env --allow-env --allow-net \
//     scripts/seed-demo/seed.ts --project <ref> [--at HH:MM] [--tz <IANA zone>]
//
// --project must match SUPABASE_URL (https://<ref>.supabase.co), or be `local`
// for 127.0.0.1 / localhost. --tz is the phones' time zone (default
// Europe/Bucharest); --at is the recording time in that zone today, at most
// 30 min after the run; without it, the run time. Works from about 06:50 to
// 18:35 local; for a night-time take, pass a --tz where it is day and set both
// phones (or the emulator) to that zone.
//
// Reset deletes only families whose every member is a demo account. If a demo
// account shares a family with anyone else, nothing is changed.
// Prints names, counts and times only: never keys, passwords, emails or tokens.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

import { countNightFeeds } from "../../supabase/functions/_shared/night-feeds.ts";
import { isValidTimeZone, localParts, type Zone } from "../../supabase/functions/_shared/zone.ts";
import {
  buildPlan,
  localTime,
  MAX_AHEAD_MIN,
  type Parent,
  type Plan,
  resolveAnchor,
  validAnchorRange,
  ZONE,
} from "./plan.ts";

/** Zones offered when it is night in the requested one; the first where it is day now is suggested. */
const DAYTIME_ZONES = [
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
  "Pacific/Honolulu",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Asia/Kolkata",
] as const;

const zoneName = (zone: Zone) =>
  zone.kind === "iana" ? zone.name : `UTC${zone.minutes >= 0 ? "+" : ""}${zone.minutes / 60}`;

export const NAMES = { parent1: "Ana", parent2: "Radu", baby: "Maia" } as const;

export type Account = { email: string; password: string };
export type Accounts = Record<Parent, Account>;

/** An expected refusal; the message is safe to print. */
export class SeedError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Null when `--project` matches the URL, else why not. */
export function checkProject(url: string, project: string | undefined): string | null {
  if (!project) return "Pass --project <ref> (or --project local for the local stack).";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "SUPABASE_URL is not a URL.";
  }
  const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (local) return project === "local" ? null : "SUPABASE_URL is the local stack: pass --project local.";
  if (parsed.protocol === "https:" && parsed.hostname === `${project}.supabase.co`) return null;
  return "--project does not match SUPABASE_URL. Nothing was changed.";
}

/** Throws a SeedError for a Postgres or Auth error, keeping only its code. */
function check(error: { code?: string; status?: number } | null, step: string): void {
  if (error) {
    throw new SeedError(`${step}_failed`, `${step} failed (${error.code ?? error.status ?? "error"}).`);
  }
}

async function findUser(admin: SupabaseClient, email: string): Promise<string | null> {
  const perPage = 1000;
  for (let page = 1;; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    check(error, "list_users");
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found.id;
    if (data.users.length < perPage) return null;
  }
}

/** Creates the account, or resets its password and name to the demo values. */
async function upsertUser(admin: SupabaseClient, account: Account, name: string): Promise<string> {
  const existing = await findUser(admin, account.email);
  const attributes = {
    password: account.password,
    email_confirm: true,
    user_metadata: { display_name: name },
  };
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing, attributes);
    check(error, "update_user");
    const profile = await admin.from("profiles").update({ display_name: name }).eq("id", existing);
    check(profile.error, "update_profile");
    return existing;
  }
  const { data, error } = await admin.auth.admin.createUser({ email: account.email, ...attributes });
  check(error, "create_user");
  if (!data.user) throw new SeedError("create_user_failed", "create_user failed.");
  return data.user.id;
}

/** Deletes the demo accounts' families, refusing if any of them has another member. */
async function resetFamilies(admin: SupabaseClient, ids: string[]): Promise<number> {
  const memberships = await admin.from("family_members").select("family_id").in("user_id", ids);
  check(memberships.error, "read_members");
  const created = await admin.from("families").select("id").in("created_by", ids);
  check(created.error, "read_families");
  const familyIds = [
    ...new Set([
      ...(memberships.data ?? []).map((m) => m.family_id as string),
      ...(created.data ?? []).map((f) => f.id as string),
    ]),
  ];
  if (familyIds.length === 0) return 0;
  const members = await admin.from("family_members").select("user_id").in("family_id", familyIds);
  check(members.error, "read_members");
  if ((members.data ?? []).some((m) => !ids.includes(m.user_id as string))) {
    throw new SeedError(
      "other_member",
      "A demo account shares a family with an account that is not a demo account. Nothing was changed.",
    );
  }
  const deleted = await admin.from("families").delete().in("id", familyIds);
  check(deleted.error, "delete_family");
  return familyIds.length;
}

export type Summary = {
  plan: Plan;
  zone: Zone;
  resetFamilies: number;
  nightFeeds: { parent1: number; parent2: number };
};

/**
 * Seeds the demo family for a recording at `at` (or `now`) in `tz` (default
 * Europe/Bucharest). `now` is the run time; the CLI passes the real clock,
 * tests a fixed one. Every check runs before anything is written.
 */
export async function seedDemo(opts: {
  admin: SupabaseClient;
  accounts: Accounts;
  now: Date;
  at?: string;
  tz?: string;
}): Promise<Summary> {
  const { admin, accounts, now } = opts;
  if (opts.tz !== undefined && !isValidTimeZone(opts.tz)) {
    throw new SeedError("bad_tz", "--tz takes an IANA time zone, like America/New_York.");
  }
  const zone: Zone = opts.tz === undefined ? ZONE : { kind: "iana", name: opts.tz };
  const anchor = resolveAnchor(now, opts.at, zone);
  if (!anchor.ok) {
    const message = {
      bad_format: "--at takes a 24-hour time, like 17:30.",
      before_run: "--at is earlier than now. Use the recording time, at most 30 min from now.",
      too_far_ahead: `--at is more than ${MAX_AHEAD_MIN} min from now. Run the seed right before recording.`,
    }[anchor.reason];
    throw new SeedError(anchor.reason, message);
  }
  const plan = buildPlan(anchor.anchor, zone);
  if (!plan) {
    const range = validAnchorRange(now, zone);
    const dayZone = DAYTIME_ZONES.find((name) => buildPlan(anchor.anchor, { kind: "iana", name }));
    throw new SeedError(
      "outside_window",
      `At ${localTime(anchor.anchor.getTime(), zone)} (${zoneName(zone)}) the card can't show a nap window ` +
        `before tonight's bedtime routine. ` +
        (range ? `Record between ${range.from} and ${range.to} there` : "No time today works there") +
        (dayZone
          ? `, or pass --tz ${dayZone} (where it is ${
            localTime(anchor.anchor.getTime(), { kind: "iana", name: dayZone })
          }) ` +
            `and set both phones to that time zone.`
          : "."),
    );
  }
  if (accounts.parent1.email.toLowerCase() === accounts.parent2.email.toLowerCase()) {
    throw new SeedError("same_account", "The two demo logins must be different accounts.");
  }

  const ids: Record<Parent, string> = {
    parent1: await upsertUser(admin, accounts.parent1, NAMES.parent1),
    parent2: await upsertUser(admin, accounts.parent2, NAMES.parent2),
  };
  const reset = await resetFamilies(admin, [ids.parent1, ids.parent2]);
  const usage = await admin.from("api_usage").delete().in("user_id", [ids.parent1, ids.parent2]);
  check(usage.error, "reset_rate_limits");

  const family = await admin.from("families").insert({ created_by: ids.parent1 }).select("id").single();
  check(family.error, "create_family");
  const familyId = family.data!.id as string;
  const members = await admin.from("family_members").insert([
    { family_id: familyId, user_id: ids.parent1 },
    { family_id: familyId, user_id: ids.parent2 },
  ]);
  check(members.error, "add_members");
  const baby = await admin
    .from("babies")
    .insert({ family_id: familyId, name: NAMES.baby, birth_date: plan.birthDate })
    .select("id")
    .single();
  check(baby.error, "create_baby");
  const babyId = baby.data!.id as string;

  const rows = plan.events.map((e) => ({
    baby_id: babyId,
    type: e.type,
    started_at: e.started_at,
    ended_at: e.ended_at,
    details: e.details,
    created_by: ids[e.by],
    source: e.source,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const inserted = await admin.from("events").insert(rows.slice(i, i + 500));
    check(inserted.error, "insert_events");
  }
  const checkins = await admin.from("checkins").insert(
    plan.checkins.map((c) => ({
      family_id: familyId,
      user_id: ids[c.by],
      day: c.day,
      answers: { mood: c.mood, help: c.help },
    })),
  );
  check(checkins.error, "insert_checkins");

  const nights = countNightFeeds({
    feeds: plan.events.filter((e) => e.type === "feed").map((e) => ({
      started_at: e.started_at,
      created_by: e.by,
    })),
    now: plan.anchor,
    zone,
    you: "parent1",
    partner: "parent2",
  });
  return {
    plan,
    zone,
    resetFamilies: reset,
    nightFeeds: { parent1: nights.you, parent2: nights.partner ?? 0 },
  };
}

/** The run summary for the terminal: names, counts and times only. */
export function describe(summary: Summary): string {
  const { plan, zone } = summary;
  const count = (type: string) => plan.events.filter((e) => e.type === type).length;
  const time = (iso: string) => localTime(Date.parse(iso), zone);
  const slot = (label: string, s: Plan["prediction"]["nap"]) =>
    `${label} ${s.window ? `${time(s.window.start)}–${time(s.window.end)}` : s.reason}`;
  const p = plan.prediction;
  const anchorDay = localParts(zone, plan.anchor.getTime()).day;
  const routine = p.routine.window
    ? `${time(p.routine.window.start)} ${
      localParts(zone, Date.parse(p.routine.window.start)).day === anchorDay ? "tonight" : "tomorrow"
    }`
    : p.routine.reason;
  return [
    `Demo family ready: ${NAMES.parent1} and ${NAMES.parent2}, baby ${NAMES.baby} (${p.age_weeks} weeks).`,
    `Replaced ${summary.resetFamilies} earlier demo family(ies).`,
    `${plan.events.length} events: ${count("feed")} feeds, ${count("sleep")} sleeps, ${
      count("diaper")
    } diapers.`,
    `Check-ins for ${new Set(plan.checkins.map((c) => c.day)).size} past days; today is unanswered.`,
    `Night feeds, last 7 nights: ${NAMES.parent1} ${summary.nightFeeds.parent1}, ${NAMES.parent2} ${summary.nightFeeds.parent2}.`,
    `Next up at ${localTime(plan.anchor.getTime(), zone)} (${zoneName(zone)}): ${slot("nap", p.nap)}, ` +
    `routine starts ${routine}, ${slot("bedtime", p.bedtime)}, ${slot("feed", p.feed)}.`,
    ...(zoneName(zone) !== zoneName(ZONE)
      ? [`Set both phones (or the emulator) to ${zoneName(zone)} before the take, or Next up won't match.`]
      : []),
  ].join("\n");
}

if (import.meta.main) {
  const arg = (name: string) => {
    const i = Deno.args.indexOf(name);
    return i >= 0 ? Deno.args[i + 1] : undefined;
  };
  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "DEMO_PARENT1_EMAIL",
    "DEMO_PARENT1_PASSWORD",
    "DEMO_PARENT2_EMAIL",
    "DEMO_PARENT2_PASSWORD",
  ];
  const missing = required.filter((name) => !Deno.env.get(name));
  if (missing.length > 0) {
    console.error(`seed-demo: set ${missing.join(", ")} in scripts/seed-demo/.env.`);
    Deno.exit(1);
  }
  const env = (name: string) => Deno.env.get(name)!;
  const refusal = checkProject(env("SUPABASE_URL"), arg("--project"));
  if (refusal) {
    console.error(`seed-demo: ${refusal}`);
    Deno.exit(1);
  }
  const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const summary = await seedDemo({
      admin,
      accounts: {
        parent1: { email: env("DEMO_PARENT1_EMAIL"), password: env("DEMO_PARENT1_PASSWORD") },
        parent2: { email: env("DEMO_PARENT2_EMAIL"), password: env("DEMO_PARENT2_PASSWORD") },
      },
      now: new Date(),
      at: arg("--at"),
      tz: arg("--tz"),
    });
    console.log(describe(summary));
  } catch (error) {
    // Only our own messages are printed; anything else could echo a request.
    console.error(`seed-demo: ${error instanceof SeedError ? error.message : "failed (unexpected)."}`);
    Deno.exit(1);
  }
}
