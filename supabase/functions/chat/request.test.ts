import { assertEquals } from "jsr:@std/assert@1.0.13";

import { VOICE_MAX_BYTES, VOICE_SAMPLE_RATE } from "../_shared/voice.ts";
import { MAX_MULTIPART_BYTES, MAX_TEXT, parseChatRequest } from "./request.ts";

const URL = "http://localhost/chat";

function jsonRequest(body: unknown): Request {
  return new Request(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function wav(ms: number): Uint8Array<ArrayBuffer> {
  const dataBytes = Math.round((ms / 1000) * VOICE_SAMPLE_RATE * 2);
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const put = (at: number, s: string) => [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  put(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, VOICE_SAMPLE_RATE, true);
  view.setUint32(28, VOICE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  put(36, "data");
  view.setUint32(40, dataBytes, true);
  return bytes;
}

/** A multipart request with an explicit Content-Length, like the app sends. */
async function multipartRequest(
  fields: { audio?: Uint8Array<ArrayBuffer>; offset?: string; tz?: string },
  length: "actual" | "missing" | number = "actual",
): Promise<Request> {
  const form = new FormData();
  if (fields.audio) form.append("audio", new Blob([fields.audio], { type: "audio/wav" }), "clip.wav");
  if (fields.offset !== undefined) form.append("tz_offset_minutes", fields.offset);
  if (fields.tz !== undefined) form.append("tz", fields.tz);
  const encoded = new Response(form);
  const type = encoded.headers.get("Content-Type") ?? "";
  const body = new Uint8Array(await encoded.arrayBuffer());
  const headers: Record<string, string> = { "Content-Type": type };
  if (length === "actual") headers["Content-Length"] = String(body.byteLength);
  else if (typeof length === "number") headers["Content-Length"] = String(length);
  return new Request(URL, { method: "POST", headers, body });
}

Deno.test("JSON text request", async () => {
  assertEquals(await parseChatRequest(jsonRequest({ text: " wet diaper ", tz_offset_minutes: 120 })), {
    ok: true,
    kind: "text",
    text: "wet diaper",
    offsetMinutes: 120,
  });
});

Deno.test("tz: a known IANA zone is passed on, an unknown one is dropped, an over-long one rejected", async () => {
  const known = await parseChatRequest(
    jsonRequest({ text: "wet", tz_offset_minutes: 120, tz: "Europe/Bucharest" }),
  );
  assertEquals(known.ok && known.kind === "text" && known.tz, "Europe/Bucharest");
  const unknown = await parseChatRequest(
    jsonRequest({ text: "wet", tz_offset_minutes: 120, tz: "Atlantis/Lost" }),
  );
  assertEquals(unknown.ok && "tz" in unknown, false);
  assertEquals(
    await parseChatRequest(jsonRequest({ text: "wet", tz_offset_minutes: 120, tz: "x".repeat(65) })),
    { ok: false, status: 400, error: "invalid_request" },
  );
  const voice = await parseChatRequest(
    await multipartRequest({ audio: wav(1500), offset: "120", tz: "Europe/Bucharest" }),
  );
  assertEquals(voice.ok && voice.kind === "voice" && voice.tz, "Europe/Bucharest");
});

Deno.test("JSON rejects extra keys such as baby_id, bad offsets and over-long text", async () => {
  const bad = [
    { text: "wet", tz_offset_minutes: 120, baby_id: "x" },
    { text: "wet", tz_offset_minutes: 900 },
    { text: "wet", tz_offset_minutes: 1.5 },
    { text: "", tz_offset_minutes: 0 },
    { text: "a".repeat(MAX_TEXT + 1), tz_offset_minutes: 0 },
    { text: "wet" },
  ];
  for (const body of bad) {
    assertEquals(await parseChatRequest(jsonRequest(body)), {
      ok: false,
      status: 400,
      error: "invalid_request",
    });
  }
});

Deno.test("unsupported content type", async () => {
  const req = new Request(URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "hi" });
  assertEquals((await parseChatRequest(req)).ok, false);
});

Deno.test("multipart voice request", async () => {
  const clip = wav(1500);
  const result = await parseChatRequest(await multipartRequest({ audio: clip, offset: "-240" }));
  assertEquals(result.ok && result.kind === "voice" && [result.wav.byteLength, result.offsetMinutes], [
    clip.byteLength,
    -240,
  ]);
});

Deno.test("multipart without Content-Length is refused before reading", async () => {
  const req = await multipartRequest({ audio: wav(500), offset: "120" }, "missing");
  assertEquals(await parseChatRequest(req), { ok: false, status: 411, error: "length_required" });
});

Deno.test("multipart with Content-Length over the cap is refused before reading", async () => {
  const req = await multipartRequest({ audio: wav(500), offset: "120" }, MAX_MULTIPART_BYTES + 1);
  assertEquals(await parseChatRequest(req), { ok: false, status: 413, error: "too_large" });
});

Deno.test("audio part over VOICE_MAX_BYTES is refused before the WAV check", async () => {
  const big = new Uint8Array(VOICE_MAX_BYTES + 1);
  assertEquals(await parseChatRequest(await multipartRequest({ audio: big, offset: "120" })), {
    ok: false,
    status: 413,
    error: "too_large",
  });
});

Deno.test("audio that is not WAV is rejected", async () => {
  const m4a = new Uint8Array(1000);
  m4a.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
  assertEquals(await parseChatRequest(await multipartRequest({ audio: m4a, offset: "120" })), {
    ok: false,
    status: 415,
    error: "not_wav",
  });
});

Deno.test("multipart needs both the audio file and a valid offset", async () => {
  for (const fields of [{ offset: "120" }, { audio: wav(500) }, { audio: wav(500), offset: "abc" }]) {
    assertEquals(await parseChatRequest(await multipartRequest(fields)), {
      ok: false,
      status: 400,
      error: "invalid_request",
    });
  }
});
