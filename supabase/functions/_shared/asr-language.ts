// The languageBias hint for Muse Voice Transcribe: the phone's language when the
// model supports it, else English. Romanian is not among the 25 supported
// languages; Romanian-language phones whose parents speak English were getting
// auto-detected into mixed alphabets. Older app versions send no language and
// get English too. Pure: no I/O.

/** ISO 639-1 code to the language name the API expects (dev.meta.ai/docs/speech-to-text). */
const SUPPORTED: Record<string, string> = {
  ar: "Arabic",
  bn: "Bengali",
  nl: "Dutch",
  en: "English",
  fr: "French",
  de: "German",
  he: "Hebrew",
  hi: "Hindi",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  kn: "Kannada",
  ko: "Korean",
  ms: "Malay",
  zh: "Mandarin Chinese",
  mr: "Marathi",
  pl: "Polish",
  pt: "Portuguese",
  es: "Spanish",
  tl: "Tagalog",
  ta: "Tamil",
  te: "Telugu",
  th: "Thai",
  tr: "Turkish",
  vi: "Vietnamese",
};

export const DEFAULT_ASR_LANGUAGE = "English";

/** A BCP 47 tag like "en-GB" or "ro-RO" (or nothing) to the languageBias list. */
export function languageBias(tag: string | undefined): string[] {
  const code = tag?.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  // "iw" and "in" are Android's legacy codes for Hebrew and Indonesian.
  const normalised = code === "iw" ? "he" : code === "in" ? "id" : code === "fil" ? "tl" : code;
  return [SUPPORTED[normalised] ?? DEFAULT_ASR_LANGUAGE];
}
