import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/card';
import { Segmented } from '@/components/controls';
import { EscalationCard } from '@/components/escalation-card';
import { Button, ErrorText } from '@/components/form';
import { Icon, Illustration } from '@/components/illustrations';
import { MicButton } from '@/components/mic-button';
import { Empty, ErrorState, Loading } from '@/components/states';
import { ProposalCard } from '@/components/proposal-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { font, MaxContentWidth, Radius, Spacing, Sticker, TypeScale, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
import { cardMessageId, messageText } from '@/lib/chat-display';
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
  const theme = useTheme();
  const scroller = useRef<ScrollViewInstance>(null);
  // Follow new content to the bottom until the parent scrolls back to read.
  const follow = useRef(true);
  const [focused, setFocused] = useState(false);
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
  const withCards = cardMessageId(list, reply);
  const newestAssistant = [...list].reverse().find((m) => m.role === 'assistant')?.id ?? null;
  const loadState: Load = threadsStatus !== 'ready' ? threadsStatus : threadId ? (listStatus[threadId] ?? 'loading') : 'loading';

  // A new message, reply, thinking state or thread scrolls to the newest content.
  useEffect(() => {
    follow.current = true;
  }, [list.length, reply, busy, threadId]);

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {/* Pinned header: Back, title, the Shared / Private switch. */}
          <View style={[styles.header, { borderColor: theme.border }]}>
            <View style={styles.titleRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                onPress={() => router.back()}
                style={({ pressed }) => [styles.back, { backgroundColor: pressed ? theme.border : theme.surface }]}>
                <Icon name="back" size={26} />
              </Pressable>
              <ThemedText type="title" accessibilityRole="header" style={styles.title}>
                Chat
              </ThemedText>
            </View>
            <Segmented options={SCOPES} value={scope} onChange={setScope} accessibilityLabel="Thread" />
          </View>

          <ScrollView
            ref={scroller}
            style={styles.fill}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => {
              follow.current = false;
            }}
            onContentSizeChange={() => {
              // After the frame: the native scroll range updates after this event on Android.
              if (follow.current) setTimeout(() => scroller.current?.scrollToEnd({ animated: false }), 50);
            }}>
            <ThemedText type="small" themeColor="textSecondary">
              {SCOPE_NOTE[scope]} Log by voice or text (“90 ml bottle twenty minutes ago, she’s asleep now”), or ask
              about the log and what’s next. No health advice: for anything health-related, contact your
              paediatrician.
            </ThemedText>

            {threadsStatus === 'error' ? (
              <ErrorState
                message="Couldn’t open the chat. Check your connection."
                onRetry={() => void retryThreads()}
                illustration={<Illustration name="error" size={180} />}
              />
            ) : loadState === 'error' && threadId ? (
              <ErrorState
                message="Couldn’t load the messages. Check your connection."
                onRetry={() => void refresh(threadId)}
                illustration={<Illustration name="error" size={180} />}
              />
            ) : loadState === 'loading' ? (
              <Loading label="Opening the chat…" />
            ) : list.length === 0 ? (
              // Only for a thread with no messages, so the art never sits next to an escalation card.
              <Empty illustration={<Illustration name="emptyChat" size={200} />}>{EMPTY[scope]}</Empty>
            ) : null}

            <View style={styles.list}>
              {list.map((m) => (
                <Message
                  key={m.id}
                  message={m}
                  mine={m.author_id === userId}
                  shared={scope === 'shared'}
                  withCards={m.id === withCards}
                  newest={m.id === newestAssistant}
                />
              ))}
            </View>

            {reply && reply.proposals.length > 0 ? (
              <View style={styles.cards}>
                {reply.proposals.map((proposal) => {
                  const state = cards[proposal.id];
                  if (!state || state.kind === 'discarded') return null;
                  if (state.kind === 'saved') {
                    return (
                      <ThemedText key={proposal.id} type="small" accessibilityLiveRegion="polite">
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
                      onSaved={(summary) =>
                        setCards((prev) => ({ ...prev, [proposal.id]: { kind: 'saved', summary } }))
                      }
                      onDiscard={() => setCards((prev) => ({ ...prev, [proposal.id]: { kind: 'discarded' } }))}
                    />
                  );
                })}
              </View>
            ) : null}

            {busy ? <Loading label="Little Rhythm is thinking…" /> : null}
            <ThemedText type="caption" themeColor="textSecondary" style={styles.privacy}>
              Voice clips are transcribed by Muse Voice Transcribe and not stored. The transcript is saved in this
              conversation.
            </ThemedText>
          </ScrollView>

          {/* Pinned composer: error line, message field and Send, then the mic with its label. */}
          <View style={[styles.composer, { borderColor: theme.border, backgroundColor: theme.background }]}>
            <ErrorText>{error}</ErrorText>
            <View style={styles.inputRow}>
              <TextInput
                accessibilityLabel="Message"
                value={text}
                onChangeText={setText}
                placeholder="Wet and dirty diaper just now"
                placeholderTextColor={theme.textSecondary}
                selectionColor={theme.focus}
                cursorColor={theme.focus}
                maxLength={MAX_TEXT}
                multiline
                editable={!busy}
                onSubmitEditing={() => void onSend()}
                onFocus={() => {
                  setFocused(true);
                  follow.current = true;
                }}
                onBlur={() => setFocused(false)}
                style={[
                  styles.input,
                  font('body', 400),
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: focused ? theme.focus : theme.border,
                  },
                ]}
              />
              <View style={styles.send}>
                <Button
                  title="Send"
                  variant="tint"
                  onPress={() => void onSend()}
                  busy={busy}
                  disabled={!text.trim() || !threadId}
                />
              </View>
            </View>
            <MicButton
              onClip={async (uri) => {
                await run((id) => sendVoice(uri, id));
              }}
              onError={setError}
              disabled={busy || !threadId}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Message({
  message,
  mine,
  shared,
  withCards,
  newest,
}: {
  message: ChatMessage;
  mine: boolean;
  shared: boolean;
  /** This phone's cards for the message are shown below the list: they carry the proposal and the note. */
  withCards: boolean;
  /** The newest assistant message is a polite live region, so a new reply is read out. */
  newest: boolean;
}) {
  const theme = useTheme();
  const live = newest ? 'polite' : undefined;
  if (message.role === 'assistant' && message.escalation) {
    return (
      <View accessibilityLiveRegion={live}>
        <EscalationCard urgent={message.escalation === 'urgent'} />
      </View>
    );
  }
  const who = message.role === 'assistant' ? 'Little Rhythm' : mine || !shared ? 'You' : 'Your partner';
  const { content, summary } = messageText(message, withCards);
  const own = message.role === 'user' && mine;
  // On the tint, meta and text are both onPrimaryTint (no opacity); elsewhere meta is secondary.
  const meta: ThemeColor = own ? 'onPrimaryTint' : 'textSecondary';
  const body = (
    <>
      <ThemedText type="caption" themeColor={meta}>
        {who} · {formatTime(message.created_at)}
      </ThemedText>
      {content ? <ThemedText themeColor={own ? 'onPrimaryTint' : 'text'}>{content}</ThemedText> : null}
      {summary ? (
        <ThemedText type="small" themeColor={meta}>
          {summary}
        </ThemedText>
      ) : null}
    </>
  );

  if (message.role === 'assistant') {
    // Little Rhythm: a card sticker on the left.
    return (
      <View style={styles.theirs}>
        <Card radius={Radius.bubble} style={styles.assistant} accessibilityLiveRegion={live}>
          {body}
        </Card>
      </View>
    );
  }
  if (own) {
    // Dark-glare rule: primary in light; a tinted navy with a lavender border in dark.
    return (
      <View
        style={[
          styles.bubble,
          styles.mine,
          { backgroundColor: theme.primaryTint, borderColor: theme.primaryTintBorder },
        ]}>
        {body}
      </View>
    );
  }
  // The partner's message: an outlined card on the left, no shelf, with the "Your partner" label.
  return (
    <View
      style={[styles.bubble, styles.partner, styles.theirs, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: Sticker.outline,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  back: { width: 52, height: 52, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
  content: {
    gap: Spacing.three,
    padding: Spacing.three,
    paddingBottom: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  list: { gap: Spacing.three },
  cards: { gap: Spacing.three },
  bubble: {
    borderRadius: Radius.bubble,
    borderWidth: Sticker.outline,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
    gap: Spacing.one,
    maxWidth: '88%',
  },
  assistant: { gap: Spacing.one, paddingVertical: Spacing.two + Spacing.one },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: Spacing.one + Spacing.half },
  theirs: { alignSelf: 'flex-start', maxWidth: '88%' },
  partner: { borderBottomLeftRadius: Spacing.one + Spacing.half },
  privacy: { textAlign: 'center' },
  composer: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + Spacing.one,
    paddingBottom: Spacing.two,
    borderTopWidth: Sticker.outline,
  },
  // Fixed minimum width, so the field doesn't jump when Send shows its spinner.
  send: { minWidth: 96 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: {
    flex: 1,
    minHeight: 56,
    maxHeight: 160,
    borderRadius: Radius.bubble,
    borderWidth: Sticker.outline,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: TypeScale.default.fontSize,
  },
});
