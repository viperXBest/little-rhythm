import { assertEquals } from "jsr:@std/assert@1.0.13";

import { checkVoiceWav, VOICE_MAX_BYTES, VOICE_SAMPLE_RATE } from "./voice.ts";

function wav(
  { ms, rate = VOICE_SAMPLE_RATE, channels = 1, bits = 16, format = 1, listChunk = false }: {
    ms: number;
    rate?: number;
    channels?: number;
    bits?: number;
    format?: number;
    listChunk?: boolean;
  },
): Uint8Array {
  const dataBytes = Math.round((ms / 1000) * rate * channels * (bits / 8));
  const extra = listChunk ? 8 + 26 : 0; // odd size exercises padding
  const bytes = new Uint8Array(44 + extra + dataBytes);
  const view = new DataView(bytes.buffer);
  const put = (at: number, s: string) => [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  put(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * (bits / 8), true);
  view.setUint16(32, channels * (bits / 8), true);
  view.setUint16(34, bits, true);
  let at = 36;
  if (listChunk) {
    put(at, "LIST");
    view.setUint32(at + 4, 25, true);
    at += 8 + 26;
  }
  put(at, "data");
  view.setUint32(at + 4, dataBytes, true);
  return bytes;
}

Deno.test("accepts 16 kHz mono PCM16 and reports duration", () => {
  assertEquals(checkVoiceWav(wav({ ms: 4800 })), { ok: true, durationMs: 4800 });
});

Deno.test("accepts a full 30 s clip within the byte cap", () => {
  const clip = wav({ ms: 30_000 });
  assertEquals(clip.byteLength <= VOICE_MAX_BYTES, true);
  assertEquals(checkVoiceWav(clip), { ok: true, durationMs: 30_000 });
});

Deno.test("skips extra chunks before data", () => {
  assertEquals(checkVoiceWav(wav({ ms: 1000, listChunk: true })), { ok: true, durationMs: 1000 });
});

Deno.test("rejects clips over the byte cap", () => {
  assertEquals(checkVoiceWav(wav({ ms: 32_000 })), { ok: false, reason: "too_large" });
});

Deno.test("rejects other rates, stereo, other depths and non-PCM", () => {
  for (const opts of [{ rate: 24_000 }, { channels: 2 }, { bits: 32 }, { format: 3 }]) {
    assertEquals(checkVoiceWav(wav({ ms: 500, ...opts })), { ok: false, reason: "wrong_format" });
  }
});

Deno.test("rejects non-WAV bytes such as m4a", () => {
  const m4a = new Uint8Array(1000);
  m4a.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]); // ....ftyp
  assertEquals(checkVoiceWav(m4a), { ok: false, reason: "not_wav" });
  assertEquals(checkVoiceWav(new Uint8Array(10)), { ok: false, reason: "not_wav" });
});
