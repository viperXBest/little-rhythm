// Next feed, nap, bedtime-routine start and bedtime for the session baby.
// POST application/json { tz?, tz_offset_minutes? }
//   -> { age_weeks, feed, nap, routine, bedtime, wake, zone: "iana" | "offset",
//        night_feeds: { nights, you, partner } }
// Computed by code from the last 7 days (_shared/predict.ts), never stored.
// The chat agent's get_next_windows calls the same engine. night_feeds is the
// couple layer's balance (_shared/night-feeds.ts); it carries counts only, no
// ids, and never goes to the chat model. Events and windows are never logged.

import { readNightFeeds, readPartnerId, readPredictionEvents, resolveBaby } from "../_shared/chat-data.ts";
import { countNightFeeds, nightFeedsSince } from "../_shared/night-feeds.ts";
import { predict } from "../_shared/predict.ts";
import { adminClient, getCaller, json, userClient } from "../_shared/supabase.ts";
import { parsePredictRequest } from "./request.ts";

const LIMIT = { fn: "predict", windowSeconds: 3600, max: 240 } as const;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = adminClient();
  const user = await getCaller(req, admin);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data: allowed, error: limitError } = await admin.rpc("consume_rate_limit", {
    p_user_id: user.id,
    p_function: LIMIT.fn,
    p_window_seconds: LIMIT.windowSeconds,
    p_max: LIMIT.max,
  });
  if (limitError) {
    console.error("predict: rate limit failed", limitError.code);
    return json({ error: "internal_error" }, 500);
  }
  if (allowed !== true) return json({ error: "rate_limited" }, 429);

  // Every read from here on runs as the caller, so RLS scopes it to their family.
  const db = userClient(req);
  const baby = await resolveBaby(db);
  if (!baby.ok) {
    if (baby.error === "failed") {
      console.error("predict: baby lookup failed");
      return json({ error: "internal_error" }, 500);
    }
    return json({ error: baby.error }, 409);
  }

  const request = await parsePredictRequest(req);
  if (!request.ok) return json({ error: request.error }, request.status);

  const now = new Date();
  try {
    const [events, nightFeeds, partner] = await Promise.all([
      readPredictionEvents(db, baby.baby.id, now),
      readNightFeeds(db, baby.baby.id, nightFeedsSince(now, request.zone)),
      readPartnerId(db, user.id),
    ]);
    const prediction = predict({ now, zone: request.zone, birthDate: baby.baby.birth_date, events });
    const night_feeds = countNightFeeds({
      feeds: nightFeeds,
      now,
      zone: request.zone,
      you: user.id,
      partner,
    });
    return json({ ...prediction, zone: request.zone.kind, night_feeds });
  } catch (error) {
    // Our own errors carry a code as their message.
    const code = error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "unexpected";
    console.error("predict: failed", code);
    return json({ error: "internal_error" }, 500);
  }
});
