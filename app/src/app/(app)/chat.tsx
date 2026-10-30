import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/controls';
import { EscalationCard } from '@/components/escalation-card';
import { Button, ErrorText, Field, Screen } from '@/components/form';
import { MicButton } from '@/components/mic-button';
import { Empty, ErrorState, Loading } from '@/components/states';
import { ProposalCard } from '@/components/proposal-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  chatErrorMessage,
  ensureThreads,
  fetchMessages,
  sendText,
  sendVoice,
  subscribeMessages,
  type ChatMessage,
  type ChatReply,
  type ChatResult,
  type ThreadIds,
} from '@/lib/chat';
import { formatTime } from '@/lib/events';
import { useSession } from '@/lib/session';

const MAX_TEXT = 1000;

type Scope = 'shared' | 'private';
type Load = 'loading' | 'ready' | 'error';
type CardState = { kind: 'open' } | { kind: 'saved'; summary: string } | { kind: 'discarded' };

const SCOPES = [
  { value: 'shared', label: 'Shared' },
  { value: 'private', label: 'Private' },
] as const;

const EMPTY: Record<Scope, string> = {
  shared: 'No messages yet. Try “wet diaper just now”, or ask when the next nap is.',
  private: 'No messages yet. This conversation is only yours.',
};

const SCOPE_NOTE: Record<Scope, string> = {
  shared: 'You and your partner both see this conversation.',
  private: 'Only you see this conversation.',
};

/** Messages keyed by id: a refetch and the realtime echo merge instead of duplicating. */
function merge(list: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export default function Chat() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [scope, setScope] = useState<Scope>('shared');
  const [threads, setThreads] = useState<ThreadIds | null>(null);
  const [threadsStatus, setThreadsStatus] = useState<Load>('loading');
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [listStatus, setListStatus] = useState<Record<string, Load>>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // This phone's latest reply per thread: its proposal cards (not stored on the server).
  const [replies, setReplies] = useState<Record<string, ChatReply>>({});
  const [cards, setCards] = useState<Record<string, CardState>>({});

  useEffect(() => {
    let cancelled = false;
    void ensureThreads().then((ids) => {
      if (cancelled) return;
      setThreads(ids);
      setThreadsStatus(ids ? 'ready' : 'error');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function retryThreads() {
    setThreadsStatus('loading');
    const ids = await ensureThreads();
    setThreads(ids);
    setThreadsStatus(ids ? 'ready' : 'error');
  }

  const threadId = threads ? threads[scope] : null;

  const refresh = useCallback(async (id: string) => {
    const rows = await fetchMessages(id);
    if (rows) setMessages((prev) => ({ ...prev, [id]: merge(prev[id] ?? [], rows) }));
    // A failed background refresh keeps what is shown; only a failed first load is an error.
    setListStatus((prev) => ({ ...prev, [id]: rows ? 'ready' : prev[id] === 'ready' ? 'ready' : 'error' }));
  }, []);

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    void fetchMessages(threadId).then((rows) => {
      if (cancelled) return;
      if (rows) setMessages((prev) => ({ ...prev, [threadId]: merge(prev[threadId] ?? [], rows) }));
      setListStatus((prev) => ({ ...prev, [threadId]: rows ? 'ready' : 'error' }));
    });
    const unsubscribe = subscribeMessages(threadId, (message) =>
      setMessages((prev) => ({ ...prev, [threadId]: merge(prev[threadId] ?? [], [message]) })),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [threadId]);

  async function run(send: (id: string) => Promise<ChatResult>): Promise<boolean> {
    if (!threadId) return false;
    const id = threadId;
    setBusy(true);
    setError(null);
    const result = await send(id).catch((): ChatResult => ({ ok: false, error: 'unknown' }));
    setBusy(false);
    // The function stored both messages; realtime usually brings them first.
    void refresh(id);
    if (!result.ok) {
      setError(chatErrorMessage[result.error]);
      return false;
    }
    setReplies((prev) => ({ ...prev, [id]: result.reply }));
    setCards(Object.fromEntries(result.reply.proposals.map((p) => [p.id, { kind: 'open' } as CardState])));
    return true;
  }

  async function onSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (await run((id) => sendText(trimmed, id))) setText('');
  }

  const list = threadId ? (messages[threadId] ?? []) : [];
  const reply = threadId ? replies[threadId] : undefined;
  const loadState: Load = threadsStatus !== 'ready' ? threadsStatus : threadId ? (listStatus[threadId] ?? 'loading') : 'loading';

  return (
    <Screen>
      <ThemedText type="subtitle">Chat</ThemedText>
      <Segmented options={SCOPES} value={scope} onChange={setScope} />
      <ThemedText type="small" themeColor="textSecondary">
        {SCOPE_NOTE[scope]} Log by voice or text (“90 ml bottle twenty minutes ago, she’s asleep now”), or ask about the log
        and what’s next. No health advice: for anything health-related, contact your paediatrician.
      </ThemedText>

      {threadsStatus === 'error' ? (
        <ErrorState message="Couldn’t open the chat. Check your connection." onRetry={() => void retryThreads()} />
      ) : loadState === 'error' && threadId ? (
        <ErrorState message="Couldn’t load the messages. Check your connection." onRetry={() => void refresh(threadId)} />
      ) : loadState === 'loading' ? (
        <Loading label="Opening the chat…" />
      ) : list.length === 0 ? (
        <Empty>{EMPTY[scope]}</Empty>
      ) : null}
      <View style={styles.list}>
        {list.map((m) => (
          <Message key={m.id} message={m} mine={m.author_id === userId} shared={scope === 'shared'} />
        ))}
      </View>

      {reply && reply.proposals.length > 0 ? (
        <View style={styles.cards}>
          {reply.proposals.map((proposal) => {
            const state = cards[proposal.id];
            if (!state || state.kind === 'discarded') return null;
            if (state.kind === 'saved') {
              return (
                <ThemedText key={proposal.id} type="small">
                  <ThemedText type="smallBold" themeColor="success">
                    ✓
                  </ThemedText>{' '}
                  Saved · {state.summary}
                </ThemedText>
              );
            }
            return (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                source={reply.source}
                onSaved={(summary) => setCards((prev) => ({ ...prev, [proposal.id]: { kind: 'saved', summary } }))}
                onDiscard={() => setCards((prev) => ({ ...prev, [proposal.id]: { kind: 'discarded' } }))}
              />
            );
          })}
        </View>
      ) : null}

      {busy ? <Loading label="Little Rhythm is thinking…" /> : null}
      <MicButton
        onClip={async (uri) => {
          await run((id) => sendVoice(uri, id));
        }}
        onError={setError}
        disabled={busy || !threadId}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Voice clips are transcribed by Muse Voice Transcribe and not stored. The transcript is saved in this
        conversation.
      </ThemedText>
      <Field
        label="Message"
        value={text}
        onChangeText={setText}
        placeholder="Wet and dirty diaper just now"
        maxLength={MAX_TEXT}
        multiline
        editable={!busy}
        onSubmitEditing={() => void onSend()}
      />
      <Button title="Send" onPress={() => void onSend()} busy={busy} disabled={!text.trim() || !threadId} />
      <ErrorText>{error}</ErrorText>
      <Button title="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

function Message({ message, mine, shared }: { message: ChatMessage; mine: boolean; shared: boolean }) {
  if (message.role === 'assistant' && message.escalation) {
    return <EscalationCard urgent={message.escalation === 'urgent'} />;
  }
  const who = message.role === 'assistant' ? 'Little Rhythm' : mine || !shared ? 'You' : 'Your partner';
  return (
    <ThemedView
      type={message.role === 'user' ? 'surface' : 'background'}
      style={[styles.bubble, message.role === 'user' && mine ? styles.mine : styles.theirs]}>
      <ThemedText type="small" themeColor="textSecondary">
        {who} · {formatTime(message.created_at)}
      </ThemedText>
      {message.content ? <ThemedText>{message.content}</ThemedText> : null}
      {message.proposal_summary ? (
        <ThemedText type="small" themeColor="textSecondary">
          {message.proposal_summary}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.two },
  cards: { gap: Spacing.two },
  bubble: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one, maxWidth: '90%' },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
});
