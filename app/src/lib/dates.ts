const MS_PER_DAY = 24 * 60 * 60 * 1000;

function utcDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day);
}

function todayUtcDay(now: Date): number {
  return utcDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** YYYY-MM-DD of a date in the phone's local calendar. */
export function toLocalDateString(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Validates a YYYY-MM-DD birth date within the last 3 years. Returns it, or null. */
export function parseBirthDate(input: string, now = new Date()): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const value = new Date(utcDay(year, month, day));
  // Rejects dates like 2026-02-30 that Date would roll over.
  if (value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) return null;
  const today = todayUtcDay(now);
  const threeYearsAgo = utcDay(now.getFullYear() - 3, now.getMonth() + 1, now.getDate());
  if (value.getTime() > today || value.getTime() < threeYearsAgo) return null;
  return match[0];
}

/** Whole weeks since a YYYY-MM-DD birth date, in the phone's local calendar. */
export function ageInWeeks(birthDate: string, now = new Date()): number {
  const [year, month, day] = birthDate.split('-').map(Number);
  const days = Math.floor((todayUtcDay(now) - utcDay(year, month, day)) / MS_PER_DAY);
  return Math.max(0, Math.floor(days / 7));
}
