// Pairing codes: 8 characters from an alphabet without look-alikes
// (no 0/O, 1/I/L). 31^8 ≈ 8.5e11 (~40 bits); with single use, a 24 h expiry
// and per-user rate limits that is far beyond guessable.

export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 8;

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
// Largest multiple of the alphabet size below 256, for unbiased sampling.
const SAMPLE_LIMIT = 256 - (256 % CODE_ALPHABET.length);

export function generateCode(): string {
  let code = "";
  const bytes = new Uint8Array(CODE_LENGTH * 2);
  while (code.length < CODE_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < SAMPLE_LIMIT) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (code.length === CODE_LENGTH) break;
    }
  }
  return code;
}

/** Uppercases and strips spaces and dashes. Returns null when not a valid code. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return CODE_PATTERN.test(code) ? code : null;
}

/** Display form: ABCD-EFGH. */
export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** HMAC-SHA-256 with a server-side pepper, hex encoded. */
export async function hashCode(code: string, pepper: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(code));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}
