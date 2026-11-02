// Run with Deno (the app has no JS test runner):
//   deno test app/src/lib/chat-display.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assertEquals } from 'jsr:@std/assert@1.0.13';

import {
  cardMessageId,
  MAX_STEPS,
  messageText,
  parseSteps,
  replyMessageId,
  stepsLabel,
  stillTimeAssumed,
  TIME_ASSUMED_NOTE,
  transcriptMessageId,
} from './chat-display.ts';

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

Deno.test('the steps row belongs to the newest assistant message with the caption, cards or not', () => {
  assertEquals(replyMessageId([user, assistant], { caption }), 'a1');
  assertEquals(replyMessageId([user, assistant], { caption: 'Other.' }), null);
  assertEquals(replyMessageId([user, assistant], { caption: null }), null);
  assertEquals(replyMessageId([user, assistant], undefined), null);
});

Deno.test('the transcript chip goes on this parent’s newest message when it is the transcript', () => {
  const said = { ...user, author_id: 'me', content: 'wet diaper' };
  const reply = { transcript: 'wet diaper', source: 'voice' };
  assertEquals(transcriptMessageId([said, { ...assistant, author_id: null }], reply, 'me'), 'u1');
  assertEquals(transcriptMessageId([said], { ...reply, source: 'chat' }, 'me'), null);
  assertEquals(transcriptMessageId([said], { source: 'voice' }, 'me'), null);
  assertEquals(transcriptMessageId([said], reply, 'partner'), null);
  assertEquals(transcriptMessageId([said], reply, null), null);
  // The server stores the first 1000 characters of a long transcript.
  const long = 'a'.repeat(1200);
  assertEquals(transcriptMessageId([{ ...said, content: long.slice(0, 1000) }], { ...reply, transcript: long }, 'me'), 'u1');
});

Deno.test('steps: strings only, bounded; an older server without steps gives none', () => {
  assertEquals(parseSteps(undefined), []);
  assertEquals(parseSteps('Read the log'), []);
  assertEquals(parseSteps(['Read the log', 3, null, '  ', 'x'.repeat(61), ' Checked Next up ']), [
    'Read the log',
    'Checked Next up',
  ]);
  assertEquals(parseSteps(Array.from({ length: 20 }, (_, i) => `Step ${i}`)).length, MAX_STEPS);
});

Deno.test('steps label: a count to show and the full list to read out', () => {
  assertEquals(stepsLabel([]), { text: 'Answered by Muse Spark', spoken: 'Answered by Muse Spark' });
  assertEquals(stepsLabel(['Proposed a diaper change']), {
    text: 'Muse Spark · 1 step',
    spoken: 'Muse Spark, 1 step: Proposed a diaper change',
  });
  assertEquals(stepsLabel(['Read the log', 'Checked Next up', 'Proposed a feed']).text, 'Muse Spark · 3 steps');
});

Deno.test('the assumed-time note goes once the parent sets the time', () => {
  assertEquals(stillTimeAssumed(true, 'feed', ['ml']), true);
  assertEquals(stillTimeAssumed(true, 'feed', ['started_at']), false);
  assertEquals(stillTimeAssumed(true, 'sleep', ['ended_at']), true);
  assertEquals(stillTimeAssumed(true, 'sleep_end', ['ended_at']), false);
  assertEquals(stillTimeAssumed(true, 'diaper', ['details']), true);
  assertEquals(stillTimeAssumed(false, 'feed', []), false);
});
