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
