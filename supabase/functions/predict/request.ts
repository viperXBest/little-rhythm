// Parses a predict request: { tz?, tz_offset_minutes? }, at least one usable.
// The IANA zone wins when the runtime knows it; the offset is the fallback.
// The body never names a baby or family; those come from the session.

import { z } from "npm:zod@4.6.6";

import { TZ_OFFSET } from "../_shared/agent-schemas.ts";
import { readCapped } from "../_shared/body.ts";
import { MAX_TZ_NAME, parseZone, type Zone } from "../_shared/zone.ts";

const MAX_JSON_BYTES = 1024;

const Body = z.strictObject({
  tz: z.string().max(MAX_TZ_NAME).optional(),
  tz_offset_minutes: z.int().min(TZ_OFFSET.min).max(TZ_OFFSET.max).optional(),
});

export type PredictRequest =
  | { ok: true; zone: Zone }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): PredictRequest => ({ ok: false, status, error });

export async function parsePredictRequest(req: Request): Promise<PredictRequest> {
  if (!(req.headers.get("Content-Type") ?? "").startsWith("application/json")) {
    return fail(415, "unsupported_media_type");
  }
  const raw = await readCapped(req, MAX_JSON_BYTES);
  if (raw === null) return fail(413, "too_large");
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return fail(400, "invalid_request");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return fail(400, "invalid_request");
  const zone = parseZone(parsed.data.tz, parsed.data.tz_offset_minutes);
  if (!zone) return fail(400, "invalid_time_zone");
  return { ok: true, zone };
}
