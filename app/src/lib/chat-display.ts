// What the chat shows next to the confirm cards, so nothing is said twice.
// No imports: this runs under the app and under `deno test` (chat-display.test.ts).

// Same text as the server's note (_shared/unclear-input.ts); fixed app text, not model output.
export const TIME_ASSUMED_NOTE = 'Time not mentioned, set to now. Edit if wrong.';

type Message = { id: string; role: 'user' | 'assistant'; content: string | null; proposal_summary: string | null };
type Reply = { caption: string | null; proposals: readonly unknown[] };

/**
 * The stored message that this phone's latest reply belongs to: the newest
 * assistant message, when its text is the reply's caption. Null when there
 * are no cards or it can't be matched (then the message shows in full).
 */
export function cardMessageId(messages: readonly Message[], reply: Reply | undefined): string | null {
  if (!reply || reply.proposals.length === 0) return null;
  const last = [...messages].reverse().find((m) => m.role === 'assistant');
  return last && last.content !== null && last.content === reply.caption ? last.id : null;
}

/**
 * A message's text and proposal line. Next to its cards, the cards already show
 * the proposal and the assumed-time note, so the line is hidden and the note
 * (which the server appends to the caption for older app versions) is cut.
 */
export function messageText(
  message: Message,
  withCards: boolean,
): { content: string | null; summary: string | null } {
  if (!withCards) return { content: message.content, summary: message.proposal_summary };
  const content = message.content?.endsWith(TIME_ASSUMED_NOTE)
    ? message.content.slice(0, -TIME_ASSUMED_NOTE.length).trimEnd()
    : message.content;
  return { content: content || null, summary: null };
}

/**
 * The stored assistant message this phone's latest reply is: the newest assistant
 * message, when its text is the reply's caption (escalations have none). Its row
 * shows the agent's steps.
 */
export function replyMessageId(messages: readonly Message[], reply: { caption: string | null } | undefined): string | null {
  if (!reply || reply.caption === null) return null;
  const last = [...messages].reverse().find((m) => m.role === 'assistant');
  return last && last.content === reply.caption ? last.id : null;
}

/** The server stores at most this much of a transcript (chat/index.ts). */
const MAX_STORED_TEXT = 1000;

/**
 * The stored message that is this phone's latest voice transcript: the newest
 * message by this parent, when its text is the transcript. It gets the Muse Voice
 * Transcribe chip.
 */
export function transcriptMessageId(
  messages: readonly (Message & { author_id: string | null })[],
  reply: { transcript?: string; source: string } | undefined,
  userId: string | null,
): string | null {
  if (!reply || reply.source !== 'voice' || reply.transcript === undefined || userId === null) return null;
  const mine = [...messages].reverse().find((m) => m.role === 'user' && m.author_id === userId);
  return mine && mine.content === reply.transcript.slice(0, MAX_STORED_TEXT) ? mine.id : null;
}

/** Bounds on the steps the app shows: the server sends at most 7 short labels. */
export const MAX_STEPS = 8;
const MAX_STEP_LENGTH = 60;

/** The reply's steps: strings only, trimmed, bounded. Missing (an older server) or malformed → []. */
export function parseSteps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= MAX_STEP_LENGTH)
    .slice(0, MAX_STEPS);
}

/** The row under a reply: what it shows and what TalkBack reads. */
export function stepsLabel(steps: readonly string[]): { text: string; spoken: string } {
  if (steps.length === 0) return { text: 'Answered by Muse Spark', spoken: 'Answered by Muse Spark' };
  const count = steps.length === 1 ? '1 step' : `${steps.length} steps`;
  return { text: `Muse Spark · ${count}`, spoken: `Muse Spark, ${count}: ${steps.join(', ')}` };
}

/** Whether a card still shows the assumed-time note after the parent edits `fields`. */
export function stillTimeAssumed(
  assumed: boolean,
  proposalType: 'feed' | 'sleep' | 'sleep_end' | 'diaper',
  fields: readonly string[],
): boolean {
  // Once the parent sets the time, it is no longer assumed.
  return assumed && !fields.includes(proposalType === 'sleep_end' ? 'ended_at' : 'started_at');
}
