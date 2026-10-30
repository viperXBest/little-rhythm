// Run with Deno (the app has no JS test runner):
//   deno test app/src/lib/chat-display.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assertEquals } from 'jsr:@std/assert@1.0.13';

import { cardMessageId, messageText, stillTimeAssumed, TIME_ASSUMED_NOTE } from './chat-display.ts';

const SERVER_NOTE = 'Time not mentioned, set to now. Edit if wrong.'; // _shared/unclear-input.ts

const user = { id: 'u1', role: 'user' as const, content: 'wet diaper', proposal_summary: null };
const caption = `Here's the diaper change.\n\n${TIME_ASSUMED_NOTE}`;
const assistant = {
  id: 'a1',
  role: 'assistant' as const,
  content: caption,
  proposal_summary: 'Proposed: wet diaper at 10:20',
};

Deno.test('the note is the same text as the server note', () => {
  assertEquals(TIME_ASSUMED_NOTE, SERVER_NOTE);
});

Deno.test('the latest reply with cards belongs to the newest assistant message with its caption', () => {
  const reply = { caption, proposals: [{}] };
  assertEquals(cardMessageId([user, assistant], reply), 'a1');
  // No cards, no reply, or a newer assistant message (the partner's turn): show everything.
  assertEquals(cardMessageId([user, assistant], { caption, proposals: [] }), null);
  assertEquals(cardMessageId([user, assistant], undefined), null);
  const newer = { ...assistant, id: 'a2', content: 'Something else.' };
  assertEquals(cardMessageId([user, assistant, newer], reply), null);
  // An escalation (null content) never matches.
  assertEquals(cardMessageId([{ ...assistant, content: null }], { caption: null, proposals: [{}] }), null);
});

Deno.test('next to its cards, a message drops the proposal line and the note', () => {
  assertEquals(messageText(assistant, true), { content: "Here's the diaper change.", summary: null });
  assertEquals(messageText(assistant, false), { content: caption, summary: 'Proposed: wet diaper at 10:20' });
  // A caption that is only the note leaves no text.
  assertEquals(messageText({ ...assistant, content: TIME_ASSUMED_NOTE }, true), { content: null, summary: null });
  // A caption without the note is unchanged.
  assertEquals(messageText({ ...assistant, content: 'Logged.' }, true), { content: 'Logged.', summary: null });
});

Deno.test('the assumed-time note goes once the parent sets the time', () => {
  assertEquals(stillTimeAssumed(true, 'feed', ['ml']), true);
  assertEquals(stillTimeAssumed(true, 'feed', ['started_at']), false);
  assertEquals(stillTimeAssumed(true, 'sleep', ['ended_at']), true);
  assertEquals(stillTimeAssumed(true, 'sleep_end', ['ended_at']), false);
  assertEquals(stillTimeAssumed(true, 'diaper', ['details']), true);
  assertEquals(stillTimeAssumed(false, 'feed', []), false);
});
