// The rules for logging an event at a chosen time, shared by the log sheets and the edit screen.
// Pure and import-free so it runs under Deno (entry-time.test.ts) as well as in the app.

/** Allow a little clock drift between the two phones. */
export const FUTURE_SLACK_MS = 60_000;

export const ML_RANGE = { min: 5, max: 400 } as const;
export const MINUTES_RANGE = { min: 1, max: 90 } as const;

export function inRange(value: unknown, range: { min: number; max: number }): value is number {
  return Number.isInteger(value) && (value as number) >= range.min && (value as number) <= range.max;
}

/** A sleep as the overlap test needs it (an `events` row of type sleep fits). */
export type SleepSpan = { id: string; started_at: string; ended_at: string | null };

/** The part of a feed the rules look at (`FeedDetails` fits). */
export type FeedAmount = { kind: 'bottle'; ml: number } | { kind: 'breast'; minutes: number };

type EntryBase = {
  start: Date;
  /** The baby's birth date, YYYY-MM-DD; null skips the check. */
  birthDate: string | null;
  /** The moment to judge "future" against (default: now). */
  now?: Date;
};

export type EntryDraft =
  | (EntryBase & { type: 'feed'; feed: FeedAmount })
  | (EntryBase & { type: 'diaper' })
  | (EntryBase & {
      type: 'sleep';
      /** null = still asleep, which only an open sleep being edited may be (`allowOpen`). */
      end: Date | null;
      allowOpen?: boolean;
      /** Other sleeps of the baby that may overlap; leave out to skip the overlap test. */
      others?: readonly SleepSpan[];
      /** The sleep being edited, so it is not compared with itself. */
      ignoreId?: string;
    });

export type EntryProblemCode =
  | 'invalid_time'
  | 'future_start'
  | 'before_birth'
  | 'amount_range'
  | 'duration_range'
  | 'end_missing'
  | 'future_end'
  | 'end_not_after_start'
  | 'overlap'
  | 'check_failed';

export type EntryProblem = { code: EntryProblemCode; message: string };

function problem(code: EntryProblemCode, message: string): EntryProblem {
  return { code, message };
}

/** Start of the birth day in the phone's local time, or null if the date isn't YYYY-MM-DD. */
export function birthDayStart(birthDate: string | null): Date | null {
  const match = birthDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate) : null;
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** Down to the minute: picked times have zero seconds, one-tap times don't, so seconds never decide an overlap. */
function toMinute(ms: number): number {
  return Math.floor(ms / 60_000) * 60_000;
}

/**
 * True when [start, end) shares time with any of `others`, compared to the minute. An open sleep (no end)
 * runs on forever, so `end` null does too. Sleeps that only touch (one ends as the next starts) don't
 * overlap. A row whose time can't be read counts as an overlap: better to refuse than to double-book.
 */
export function sleepOverlaps(
  start: Date,
  end: Date | null,
  others: readonly SleepSpan[],
  ignoreId?: string,
): boolean {
  const from = toMinute(start.getTime());
  const until = end ? toMinute(end.getTime()) : Infinity;
  return others.some((other) => {
    if (ignoreId !== undefined && other.id === ignoreId) return false;
    const otherFrom = Date.parse(other.started_at);
    const otherUntil = other.ended_at === null ? Infinity : Date.parse(other.ended_at);
    if (Number.isNaN(otherFrom) || Number.isNaN(otherUntil)) return true;
    return toMinute(otherFrom) < until && from < toMinute(otherUntil);
  });
}

/** The first rule the entry breaks, or null when it can be saved. */
export function validateEntry(draft: EntryDraft): EntryProblem | null {
  const latest = (draft.now ?? new Date()).getTime() + FUTURE_SLACK_MS;
  const start = draft.start.getTime();
  const subject = draft.type === 'sleep' ? 'The start' : 'The time';

  if (Number.isNaN(start)) return problem('invalid_time', `${subject} isn’t a valid time.`);
  if (start > latest) return problem('future_start', `${subject} can’t be in the future.`);
  const born = birthDayStart(draft.birthDate);
  if (born && start < born.getTime()) {
    return problem('before_birth', `${subject} can’t be before the birth date.`);
  }

  if (draft.type === 'feed') {
    const { feed } = draft;
    if (feed.kind === 'bottle' && !inRange(feed.ml, ML_RANGE)) {
      return problem('amount_range', `Amount must be ${ML_RANGE.min}–${ML_RANGE.max} ml.`);
    }
    if (feed.kind === 'breast' && !inRange(feed.minutes, MINUTES_RANGE)) {
      return problem('duration_range', `Duration must be ${MINUTES_RANGE.min}–${MINUTES_RANGE.max} min.`);
    }
  }

  if (draft.type === 'sleep') {
    const { end } = draft;
    if (end === null) {
      if (!draft.allowOpen) return problem('end_missing', 'Add when the sleep ended.');
    } else {
      if (Number.isNaN(end.getTime())) return problem('invalid_time', 'The end isn’t a valid time.');
      if (end.getTime() > latest) return problem('future_end', 'The end can’t be in the future.');
      if (end.getTime() <= start) return problem('end_not_after_start', 'The end must be after the start.');
    }
    if (draft.others && sleepOverlaps(draft.start, end, draft.others, draft.ignoreId)) {
      return problem('overlap', 'This sleep overlaps another sleep in the log.');
    }
  }
  return null;
}

const CHECK_FAILED = 'Could not check your sleeps. Check your connection and try again.';

/** What the overlap query needs: the span being saved, and the sleep being edited (left out of the result). */
export type SleepQuery = { start: Date; end: Date | null; excludeId?: string };

/**
 * validateEntry, plus the sleep-overlap test for sleeps. `fetchOthers` returns the stored sleeps that could
 * overlap the span (null when it couldn't be fetched, which refuses the entry rather than saving unchecked).
 * It is only called for sleeps whose own times already pass.
 */
export async function checkEntryWith(
  draft: EntryDraft,
  fetchOthers: (query: SleepQuery) => Promise<SleepSpan[] | null>,
): Promise<EntryProblem | null> {
  const broken = validateEntry(draft);
  if (broken || draft.type !== 'sleep') return broken;
  const others = await fetchOthers({ start: draft.start, end: draft.end, excludeId: draft.ignoreId });
  if (!others) return problem('check_failed', CHECK_FAILED);
  return validateEntry({ ...draft, others });
}

/** "Saved for Mon 2 Nov": the confirmation for an entry Home's today-only list won't show. */
export function savedForText(start: Date, locales: string | string[] = []): string {
  return `Saved for ${start.toLocaleDateString(locales, { weekday: 'short', day: 'numeric', month: 'short' })}`;
}
