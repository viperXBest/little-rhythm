// Fills a user's current fixed window in api_usage, as consume_rate_limit
// computes it, so the next call to the function is over the limit.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";

export async function fillWindow(
  admin: SupabaseClient,
  userId: string,
  fn: string,
  windowSeconds: number,
  max: number,
): Promise<void> {
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const { error } = await admin.from("api_usage").upsert({
    user_id: userId,
    function: fn,
    window_start: new Date(windowStart * 1000).toISOString(),
    count: max,
  });
  if (error) throw error;
}

/** Today's UTC day, as consume_chat_budget computes it. */
export function utcDayStart(): string {
  return new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString();
}

/** Sets a family's chat turns for today (usage_counters, scope family). */
export async function setFamilyTurns(admin: SupabaseClient, familyId: string, count: number): Promise<void> {
  const { error } = await admin.from("usage_counters").upsert(
    { scope: "family", family_id: familyId, function: "chat", window_start: utcDayStart(), count },
    { onConflict: "scope,family_id,function,window_start" },
  );
  if (error) throw error;
}

/** Today's global chat spend in micro-USD, or null when there is no row yet. */
export async function globalSpend(admin: SupabaseClient): Promise<number | null> {
  const { data, error } = await admin.from("usage_counters").select("count")
    .eq("scope", "global").eq("function", "chat_spend").eq("window_start", utcDayStart()).maybeSingle();
  if (error) throw error;
  return data ? Number(data.count) : null;
}

/** Sets today's global chat spend; returns a function that puts the previous value back. */
export async function setGlobalSpend(admin: SupabaseClient, micros: number): Promise<() => Promise<void>> {
  const previous = await globalSpend(admin);
  const write = async (count: number | null) => {
    const del = await admin.from("usage_counters").delete()
      .eq("scope", "global").eq("function", "chat_spend").eq("window_start", utcDayStart());
    if (del.error) throw del.error;
    if (count === null) return;
    const ins = await admin.from("usage_counters").insert(
      { scope: "global", family_id: null, function: "chat_spend", window_start: utcDayStart(), count },
    );
    if (ins.error) throw ins.error;
  };
  await write(micros);
  return () => write(previous);
}
