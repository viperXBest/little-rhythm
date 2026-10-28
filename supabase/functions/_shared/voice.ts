// Voice clips: the app records WAV (RIFF, PCM 16-bit, mono, 16 kHz) and the
// chat function forwards it unchanged to Muse Voice Transcribe
// (POST /v1/asr/transcribe, audioEncoding WAV). No conversion anywhere.

export const VOICE_SAMPLE_RATE = 16_000;
export const VOICE_MAX_MS = 30_000;
const BYTES_PER_SECOND = VOICE_SAMPLE_RATE * 2; // mono, 16-bit
// 30 s of audio plus room for the header and extra chunks (LIST etc.): ~0.96 MB.
export const VOICE_MAX_BYTES = (VOICE_MAX_MS / 1000) * BYTES_PER_SECOND + 4096;

export type WavCheck =
  | { ok: true; durationMs: number }
  | { ok: false; reason: "too_large" | "not_wav" | "wrong_format" | "too_long" };

/** Validates size and header before the clip leaves the function. */
export function checkVoiceWav(bytes: Uint8Array): WavCheck {
  if (bytes.byteLength > VOICE_MAX_BYTES) return { ok: false, reason: "too_large" };
  if (bytes.byteLength < 44 || ascii(bytes, 0) !== "RIFF" || ascii(bytes, 8) !== "WAVE") {
    return { ok: false, reason: "not_wav" };
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmtOk = false;
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > bytes.byteLength) return { ok: false, reason: "not_wav" };
      fmtOk = view.getUint16(body, true) === 1 && // PCM
        view.getUint16(body + 2, true) === 1 && // mono
        view.getUint32(body + 4, true) === VOICE_SAMPLE_RATE &&
        view.getUint16(body + 14, true) === 16;
      if (!fmtOk) return { ok: false, reason: "wrong_format" };
    } else if (id === "data") {
      if (!fmtOk) return { ok: false, reason: "not_wav" };
      // Recorders may leave the data size at 0 or past the end; trust the file length.
      const dataBytes = Math.min(size || Infinity, bytes.byteLength - body);
      const durationMs = Math.round((dataBytes / BYTES_PER_SECOND) * 1000);
      if (durationMs > VOICE_MAX_MS) return { ok: false, reason: "too_long" };
      return { ok: true, durationMs };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  return { ok: false, reason: "not_wav" };
}

function ascii(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}
