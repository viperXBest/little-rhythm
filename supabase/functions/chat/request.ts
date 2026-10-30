// Parses a chat request without reading more than the caps allow.
// JSON:      { text, thread_id, tz_offset_minutes, tz? }
// multipart: audio (WAV file) + thread_id + tz_offset_minutes + tz? + lang?
// lang is the phone's language tag (BCP 47) for the transcription hint; absent
// or unknown means English (asr-language.ts), so older apps keep working.
// tz is the phone's IANA zone; an unknown name is dropped, not rejected.
// The body never names a baby or family; those come from the session. The
// thread id is checked against the caller's family before anything is stored.

import { z } from "npm:zod@4.6.6";

import { TZ_OFFSET } from "../_shared/agent-schemas.ts";
import { readCapped } from "../_shared/body.ts";
import { checkVoiceWav, VOICE_MAX_BYTES } from "../_shared/voice.ts";
import { isValidTimeZone, MAX_TZ_NAME } from "../_shared/zone.ts";

export const MAX_TEXT = 1000;
const MAX_JSON_BYTES = 16 * 1024;
/** The WAV plus room for the multipart boundaries and the offset field. */
export const MAX_MULTIPART_BYTES = VOICE_MAX_BYTES + 16 * 1024;

const Offset = z.int().min(TZ_OFFSET.min).max(TZ_OFFSET.max);
const TimeZone = z.string().max(MAX_TZ_NAME);
const ThreadId = z.uuid();
const Lang = z.string().max(35).regex(/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{1,8})*$/);
const TextBody = z.strictObject({
  text: z.string().trim().min(1).max(MAX_TEXT),
  thread_id: ThreadId,
  tz_offset_minutes: Offset,
  tz: TimeZone.optional(),
});

export type ChatRequest =
  | { ok: true; kind: "text"; text: string; threadId: string; offsetMinutes: number; tz?: string }
  | {
    ok: true;
    kind: "voice";
    wav: Uint8Array<ArrayBuffer>;
    /** The phone's language tag, when it sent a well-formed one. */
    lang?: string;
    threadId: string;
    offsetMinutes: number;
    tz?: string;
  }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): ChatRequest => ({ ok: false, status, error });

/** Cheap header checks, done before rate limiting or reading the body. */
export function checkHeaders(req: Request): ChatRequest | null {
  const type = req.headers.get("Content-Type") ?? "";
  const lengthHeader = req.headers.get("Content-Length");
  const length = lengthHeader === null ? null : Number(lengthHeader);
  if (length !== null && (!Number.isSafeInteger(length) || length < 0)) return fail(400, "invalid_request");

  if (type.startsWith("multipart/form-data")) {
    if (length === null) return fail(411, "length_required");
    if (length > MAX_MULTIPART_BYTES) return fail(413, "too_large");
    return null;
  }
  if (type.startsWith("application/json")) {
    if (length !== null && length > MAX_JSON_BYTES) return fail(413, "too_large");
    return null;
  }
  return fail(415, "unsupported_media_type");
}

export async function parseChatRequest(req: Request): Promise<ChatRequest> {
  const headerError = checkHeaders(req);
  if (headerError) return headerError;

  if ((req.headers.get("Content-Type") ?? "").startsWith("application/json")) {
    const raw = await readCapped(req, MAX_JSON_BYTES);
    if (raw === null) return fail(413, "too_large");
    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return fail(400, "invalid_request");
    }
    const parsed = TextBody.safeParse(body);
    if (!parsed.success) return fail(400, "invalid_request");
    return {
      ok: true,
      kind: "text",
      text: parsed.data.text,
      threadId: parsed.data.thread_id,
      offsetMinutes: parsed.data.tz_offset_minutes,
      ...knownZone(parsed.data.tz),
    };
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "invalid_request");
  }
  const audio = form.get("audio");
  const offset = Offset.safeParse(Number(form.get("tz_offset_minutes") ?? Number.NaN));
  const thread = ThreadId.safeParse(form.get("thread_id"));
  const tzField = form.get("tz");
  // A malformed lang is dropped (English hint), not rejected.
  const lang = Lang.safeParse(form.get("lang"));
  const tz = tzField === null ? { success: true as const, data: undefined } : TimeZone.safeParse(tzField);
  if (!(audio instanceof File) || !thread.success || !offset.success || !tz.success) {
    return fail(400, "invalid_request");
  }
  if (audio.size > VOICE_MAX_BYTES) return fail(413, "too_large");
  const wav = new Uint8Array(await audio.arrayBuffer());
  const check = checkVoiceWav(wav);
  if (!check.ok) {
    return fail(check.reason === "too_large" || check.reason === "too_long" ? 413 : 415, check.reason);
  }
  return {
    ok: true,
    kind: "voice",
    wav,
    ...(lang.success ? { lang: lang.data } : {}),
    threadId: thread.data,
    offsetMinutes: offset.data,
    ...knownZone(tz.data),
  };
}

function knownZone(tz: string | undefined): { tz?: string } {
  return tz !== undefined && isValidTimeZone(tz) ? { tz } : {};
}
