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

/** Whether a card still shows the assumed-time note after the parent edits `fields`. */
export function stillTimeAssumed(
  assumed: boolean,
  proposalType: 'feed' | 'sleep' | 'sleep_end' | 'diaper',
  fields: readonly string[],
): boolean {
  // Once the parent sets the time, it is no longer assumed.
  return assumed && !fields.includes(proposalType === 'sleep_end' ? 'ended_at' : 'started_at');
}
