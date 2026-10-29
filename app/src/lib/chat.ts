import { FunctionsHttpError } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';

import {
  newEventRow,
  type BreastSide,
  type EventRow,
  type EventSource,
  type FeedDetails,
} from '@/lib/events';
import { supabase } from '@/lib/supabase';
import { timeZoneName, tzOffsetMinutes } from '@/lib/time-zone';

// Mirrors supabase/functions/_shared/agent-schemas.ts. The server validated
// these; fields that failed are missing and listed in `errors`.
export type ProposalError = { field: string; code: string };

export type FeedProposal = {
  id: string;
  type: 'feed';
  started_at: string | null;
  details: { kind?: FeedDetails['kind']; ml?: number; side?: BreastSide; minutes?: number };
  errors: ProposalError[];
};
export type SleepProposal = {
  id: string;
  type: 'sleep';
  started_at: string | null;
  ended_at: string | null;
  errors: ProposalError[];
};
export type SleepEndProposal = {
  id: string;
  type: 'sleep_end';
  sleep_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  errors: ProposalError[];
};
export type DiaperProposal = {
  id: string;
  type: 'diaper';
  started_at: string | null;
  details: { wet?: boolean; dirty?: boolean };
  errors: ProposalError[];
};
export type Proposal = FeedProposal | SleepProposal | SleepEndProposal | DiaperProposal;

export type ChatSource = Extract<EventSource, 'chat' | 'voice'>;
export type ChatReply = {
  transcript?: string;
  caption: string;
  proposals: Proposal[];
  source: ChatSource;
};

export type ChatError =
  | 'rate_limited'
  | 'not_in_family'
  | 'multiple_babies'
  | 'no_speech'
  | 'too_large'
  | 'too_long'
  | 'not_wav'
  | 'wrong_format'
  | 'transcribe_failed'
  | 'model_failed'
  | 'unknown';

const KNOWN: readonly ChatError[] = [
  'rate_limited',
  'not_in_family',
  'multiple_babies',
  'no_speech',
  'too_large',
  'too_long',
  'not_wav',
  'wrong_format',
  'transcribe_failed',
  'model_failed',
];

export const chatErrorMessage: Record<ChatError, string> = {
  rate_limited: 'That’s a lot of messages. Try again in a little while.',
  not_in_family: 'Create a family first.',
  multiple_babies: 'Chat logging supports one baby per family for now.',
  no_speech: 'I didn’t catch that. Hold the mic and try again.',
  too_large: 'That clip is too long. Keep it under 30 seconds.',
  too_long: 'That clip is too long. Keep it under 30 seconds.',
  not_wav: 'The recording could not be read. Try again.',
  wrong_format: 'The recording could not be read. Try again.',
  transcribe_failed: 'Voice transcription is unavailable right now. Try typing instead.',
  model_failed: 'The assistant is unavailable right now. Use the quick log buttons instead.',
  unknown: 'Something went wrong. Check your connection and try again.',
};

export type ChatResult = { ok: true; reply: ChatReply } | { ok: false; error: ChatError };

const PROPOSAL_TYPES = new Set(['feed', 'sleep', 'sleep_end', 'diaper']);

function parseReply(data: unknown): ChatReply | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  if (typeof body.caption !== 'string' || !Array.isArray(body.proposals)) return null;
  if (body.source !== 'chat' && body.source !== 'voice') return null;
  const proposals = body.proposals.filter(
    (p): p is Proposal =>
      !!p &&
      typeof p === 'object' &&
      typeof (p as { id?: unknown }).id === 'string' &&
      PROPOSAL_TYPES.has((p as { type?: unknown }).type as string) &&
      Array.isArray((p as { errors?: unknown }).errors),
  );
  return {
    ...(typeof body.transcript === 'string' ? { transcript: body.transcript } : {}),
    caption: body.caption,
    proposals,
    source: body.source,
  };
}

async function invokeChat(body: ArrayBuffer | Record<string, unknown>, headers?: Record<string, string>) {
  const { data, error } = await supabase.functions.invoke<unknown>('chat', { body, headers });
  if (!error) {
    const reply = parseReply(data);
    return reply ? ({ ok: true, reply } as const) : ({ ok: false, error: 'unknown' } as const);
  }
  if (error instanceof FunctionsHttpError) {
    try {
      const payload: unknown = await error.context.json();
      if (payload && typeof payload === 'object' && 'error' in payload) {
        const code = (payload as { error: unknown }).error;
        const match = KNOWN.find((known) => known === code);
        if (match) return { ok: false, error: match } as const;
      }
    } catch {
      // Fall through to unknown.
    }
  }
  return { ok: false, error: 'unknown' } as const;
}

export function sendText(text: string): Promise<ChatResult> {
  const tz = timeZoneName();
  return invokeChat({ text, tz_offset_minutes: tzOffsetMinutes(), ...(tz ? { tz } : {}) });
}

/**
 * Uploads a WAV clip as multipart/form-data. The body is built here, not with
 * FormData, so it goes out with a Content-Length: the function refuses
 * multipart requests without one, and React Native streams FormData files chunked.
 */
export async function sendVoice(uri: string): Promise<ChatResult> {
  const audio = await new File(uri).bytes();
  const boundary = `lr-${randomUUID()}`;
  const encoder = new TextEncoder();
  const tz = timeZoneName();
  const field = (name: string, value: string) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  const head = encoder.encode(
    field('tz_offset_minutes', String(tzOffsetMinutes())) +
      (tz ? field('tz', tz) : '') +
      `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="clip.wav"\r\n` +
      'Content-Type: audio/wav\r\n\r\n',
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.byteLength + audio.byteLength + tail.byteLength);
  body.set(head, 0);
  body.set(audio, head.byteLength);
  body.set(tail, head.byteLength + audio.byteLength);
  return invokeChat(body.buffer, { 'Content-Type': `multipart/form-data; boundary=${boundary}` });
}

/**
 * Builds the event row for a confirmed card. The baby is the session's;
 * nothing in the proposal can choose it.
 */
export function proposalToRow(input: {
  type: 'feed' | 'sleep' | 'diaper';
  babyId: string;
  userId: string;
  source: ChatSource;
  startedAt: Date;
  endedAt?: Date | null;
  feed?: FeedDetails;
  diaper?: { wet: boolean; dirty: boolean };
}): EventRow {
  return newEventRow({
    babyId: input.babyId,
    userId: input.userId,
    type: input.type,
    startedAt: input.startedAt,
    endedAt: input.type === 'sleep' ? (input.endedAt ?? null) : null,
    details: input.type === 'feed' ? input.feed : input.type === 'diaper' ? input.diaper : undefined,
    source: input.source,
  });
}
