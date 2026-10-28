import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { MicButton } from '@/components/mic-button';
import { ProposalCard } from '@/components/proposal-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { chatErrorMessage, sendText, sendVoice, type ChatReply, type ChatResult } from '@/lib/chat';

const MAX_TEXT = 1000;

type CardState = { kind: 'open' } | { kind: 'saved'; summary: string } | { kind: 'discarded' };

export default function Chat() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<ChatReply | null>(null);
  const [cards, setCards] = useState<Record<string, CardState>>({});

  async function run(send: () => Promise<ChatResult>): Promise<boolean> {
    setBusy(true);
    setError(null);
    const result = await send().catch((): ChatResult => ({ ok: false, error: 'unknown' }));
    setBusy(false);
    if (!result.ok) {
      setError(chatErrorMessage[result.error]);
      return false;
    }
    setReply(result.reply);
    setCards(Object.fromEntries(result.reply.proposals.map((p) => [p.id, { kind: 'open' } as CardState])));
    return true;
  }

  async function onSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (await run(() => sendText(trimmed))) setText('');
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Log by chat or voice</ThemedText>
      <ThemedText themeColor="textSecondary">
        Say what happened, like “90 ml bottle at 3, she’s asleep now”. You confirm each entry before it’s
        saved.
      </ThemedText>
      <MicButton
        onClip={async (uri) => {
          await run(() => sendVoice(uri));
        }}
        onError={setError}
        disabled={busy}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Voice clips are transcribed by Muse Voice Transcribe and not stored.
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
      <Button title="Send" onPress={() => void onSend()} busy={busy} disabled={!text.trim()} />
      <ErrorText>{error}</ErrorText>

      {reply ? (
        <View style={styles.reply}>
          {reply.transcript ? (
            <ThemedView type="backgroundElement" style={styles.bubble}>
              <ThemedText type="small" themeColor="textSecondary">
                You said
              </ThemedText>
              <ThemedText>{reply.transcript}</ThemedText>
            </ThemedView>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {reply.caption}
          </ThemedText>
          {reply.proposals.map((proposal) => {
            const state = cards[proposal.id];
            if (!state || state.kind === 'discarded') return null;
            if (state.kind === 'saved') {
              return (
                <ThemedText key={proposal.id} type="small">
                  ✓ Saved · {state.summary}
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

      <Button title="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  reply: { gap: Spacing.two },
  bubble: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one },
});
