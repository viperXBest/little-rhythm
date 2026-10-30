/** Minutes east of UTC, e.g. 120 in Bucharest in winter. */
export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset();
}

/**
 * The phone's IANA zone ("Europe/Bucharest"), or null if Intl can't tell.
 * The server validates it again and falls back to the offset.
 */
export function timeZoneName(): string | null {
  try {
    const name = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof name === 'string' && /^[A-Za-z0-9_+\-/]{1,64}$/.test(name) ? name : null;
  } catch {
    return null;
  }
}

/**
 * The phone's language as a BCP 47 tag ("en-GB", "ro-RO"), or null if Intl
 * can't tell. Sent with voice clips as a transcription hint only.
 */
export function languageTag(): string | null {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale;
    return typeof tag === 'string' && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{1,8})*$/.test(tag) && tag.length <= 35
      ? tag
      : null;
  } catch {
    return null;
  }
}
