import { FunctionsHttpError, type RealtimeChannel } from '@supabase/supabase-js';
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
import { languageTag, timeZoneName, tzOffsetMinutes } from '@/lib/time-zone';

// Mirrors supabase/functions/_shared/agent-schemas.ts. The server validated
// these; fields that failed are missing and listed in `errors`.
export type ProposalError = { field: string; code: string };

export type FeedProposal = {
  id: string;
  type: 'feed';
  started_at: string | null;
  details: { kind?: FeedDetails['kind']; ml?: number; side?: BreastSide; minutes?: number };
  errors: ProposalError[];
  /** The parent gave no time; the server set it to now. Absent from older servers. */
  time_assumed?: boolean;
};
export type SleepProposal = {
  id: string;
  type: 'sleep';
  started_at: string | null;
  ended_at: string | null;
  errors: ProposalError[];
  /** The parent gave no time; the server set it to now. Absent from older servers. */
  time_assumed?: boolean;
};
export type SleepEndProposal = {
  id: string;
  type: 'sleep_end';
  sleep_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  errors: ProposalError[];
  /** The parent gave no time; the server set it to now. Absent from older servers. */
  time_assumed?: boolean;
};
export type DiaperProposal = {
  id: string;
  type: 'diaper';
  started_at: string | null;
  details: { wet?: boolean; dirty?: boolean };
  errors: ProposalError[];
  /** The parent gave no time; the server set it to now. Absent from older servers. */
  time_assumed?: boolean;
};
export type Proposal = FeedProposal | SleepProposal | SleepEndProposal | DiaperProposal;

export type ChatSource = Extract<EventSource, 'chat' | 'voice'>;
/** A health question: the app shows a static card, never model text. */
export type Escalation = { urgent: boolean };
export type ChatReply = {
  transcript?: string;
  /** Null when the turn escalated. */
  caption: string | null;
  escalation: Escalation | null;
  proposals: Proposal[];
  source: ChatSource;
  threadId: string;
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
  | 'thread_not_found'
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
  'thread_not_found',
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
  thread_not_found: 'This conversation isn’t available. Go back and open the chat again.',
  unknown: 'Something went wrong. Check your connection and try again.',
};

export type ChatResult = { ok: true; reply: ChatReply } | { ok: false; error: ChatError };

const PROPOSAL_TYPES = new Set(['feed', 'sleep', 'sleep_end', 'diaper']);

function parseReply(data: unknown): ChatReply | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  if (!(typeof body.caption === 'string' || body.caption === null) || !Array.isArray(body.proposals)) return null;
  if (body.source !== 'chat' && body.source !== 'voice') return null;
  if (typeof body.thread_id !== 'string') return null;
  const escalation = parseEscalation(body.escalation);
  if (escalation === undefined) return null;
  // A reply is either a caption or an escalation, never neither.
  if (body.caption === null && escalation === null) return null;
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
    caption: escalation ? null : body.caption,
    escalation,
    proposals,
    source: body.source,
    threadId: body.thread_id,
  };
}

/** null for no escalation, undefined for a malformed value. */
function parseEscalation(value: unknown): Escalation | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object' && typeof (value as { urgent?: unknown }).urgent === 'boolean') {
    return { urgent: (value as { urgent: boolean }).urgent };
  }
  return undefined;
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

export function sendText(text: string, threadId: string): Promise<ChatResult> {
  const tz = timeZoneName();
  return invokeChat({ text, thread_id: threadId, tz_offset_minutes: tzOffsetMinutes(), ...(tz ? { tz } : {}) });
}

/**
 * Uploads a WAV clip as multipart/form-data. The body is built here, not with
 * FormData, so it goes out with a Content-Length: the function refuses
 * multipart requests without one, and React Native streams FormData files chunked.
 */
export async function sendVoice(uri: string, threadId: string): Promise<ChatResult> {
  const audio = await new File(uri).bytes();
  const boundary = `lr-${randomUUID()}`;
  const encoder = new TextEncoder();
  const tz = timeZoneName();
  // The transcription hint: the server maps it to a supported language or English.
  const lang = languageTag();
  const field = (name: string, value: string) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  const head = encoder.encode(
    field('thread_id', threadId) +
      field('tz_offset_minutes', String(tzOffsetMinutes())) +
      (tz ? field('tz', tz) : '') +
      (lang ? field('lang', lang) : '') +
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

// ---------------------------------------------------------------------------
// Threads: one shared per family, one private per parent (RLS keeps it theirs)
// ---------------------------------------------------------------------------

export type ThreadIds = { shared: string; private: string };
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string | null;
  escalation: 'health' | 'urgent' | null;
  proposal_summary: string | null;
  author_id: string | null;
  created_at: string;
};

const MESSAGE_COLUMNS = 'id, role, content, escalation, proposal_summary, author_id, created_at';
const HISTORY_SIZE = 50;

/** The family's shared thread and the caller's private one, created on first use. */
export async function ensureThreads(): Promise<ThreadIds | null> {
  const { data, error } = await supabase.rpc('ensure_chat_threads').single();
  if (error || !data) return null;
  return { shared: data.shared_id, private: data.private_id };
}

function toMessage(row: Record<string, unknown>): ChatMessage | null {
  if (typeof row.id !== 'string' || (row.role !== 'user' && row.role !== 'assistant')) return null;
  const escalation = row.escalation === 'health' || row.escalation === 'urgent' ? row.escalation : null;
  return {
    id: row.id,
    role: row.role,
    content: typeof row.content === 'string' ? row.content : null,
    escalation,
    proposal_summary: typeof row.proposal_summary === 'string' ? row.proposal_summary : null,
    author_id: typeof row.author_id === 'string' ? row.author_id : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

/** The thread's latest messages, oldest first, or null on failure. */
export async function fetchMessages(threadId: string): Promise<ChatMessage[] | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_SIZE);
  if (error) return null;
  return (data ?? [])
    .map((row) => toMessage(row as Record<string, unknown>))
    .filter((m): m is ChatMessage => m !== null)
    .reverse();
}

/**
 * New messages in a thread, live. Realtime checks RLS per subscriber, so the
 * partner gets shared-thread messages only. Returns an unsubscribe function.
 */
export function subscribeMessages(threadId: string, onInsert: (message: ChatMessage) => void): () => void {
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  void (async () => {
    await supabase.realtime.setAuth();
    if (cancelled) return;
    channel = supabase
      .channel(`chat_messages:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const message = toMessage(payload.new as Record<string, unknown>);
          if (message) onInsert(message);
        },
      )
      .subscribe();
  })();
  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
