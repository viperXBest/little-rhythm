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
