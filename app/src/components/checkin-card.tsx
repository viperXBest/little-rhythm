import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Segmented } from '@/components/controls';
import { Button, ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import {
  checkinDay,
  fetchCheckins,
  HELP_MAX,
  subscribeCheckins,
  submitCheckin,
  type Checkin,
} from '@/lib/checkin';
import { syncCheckin } from '@/lib/reminders';
import { useSession } from '@/lib/session';

const MOODS = [
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
  { value: '5', label: '5' },
] as const;
type MoodValue = (typeof MOODS)[number]['value'];

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; day: string; rows: Checkin[] };

/** Two questions a day; the partner's answers appear once you have answered too. */
export function CheckinCard() {
  const { family, session } = useSession();
  const userId = session?.user.id ?? null;
  const familyId = family?.id ?? null;
  const day = checkinDay(useNow(60_000));
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    if (!familyId) return;
    const rows = await fetchCheckins(familyId, day);
    setState(rows ? { status: 'ready', day, rows } : { status: 'error' });
  }, [familyId, day]);

  // Load on mount and when the local day changes; refetch on any visible insert.
  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    void fetchCheckins(familyId, day).then((rows) => {
      if (!cancelled) setState(rows ? { status: 'ready', day, rows } : { status: 'error' });
    });
    const unsubscribe = subscribeCheckins(familyId, () => void load());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [familyId, day, load]);

  const mine = state.status === 'ready' ? (state.rows.find((r) => r.userId === userId) ?? null) : null;
  const partner = state.status === 'ready' ? (state.rows.find((r) => r.userId !== userId) ?? null) : null;
  const answered = mine !== null;

  // Keep the 21:00 reminder in step with today's answer (only if reminders are on).
  useEffect(() => {
    if (state.status === 'ready') void syncCheckin(answered);
  }, [state.status, answered]);

  if (!family || !userId) return null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Daily check-in</ThemedText>
      {state.status === 'loading' ? <ThemedText themeColor="textSecondary">Loading…</ThemedText> : null}
      {state.status === 'error' ? (
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            Couldn’t load the check-in. Check your connection.
          </ThemedText>
          <Button title="Try again" variant="secondary" onPress={() => void load()} />
        </View>
      ) : null}
      {state.status === 'ready' && !mine ? (
        <CheckinForm familyId={family.id} userId={userId} day={state.day} onDone={() => void load()} />
      ) : null}
      {mine ? (
        <View style={styles.block}>
          <Answer who="You" checkin={mine} />
          {family.memberCount < 2 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Invite your partner to share check-ins.
            </ThemedText>
          ) : partner ? (
            <Answer who="Your partner" checkin={partner} />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Waiting for your partner. Their answers appear here once they answer.
            </ThemedText>
          )}
        </View>
      ) : null}
    </ThemedView>
  );
}

function CheckinForm({
  familyId,
  userId,
  day,
  onDone,
}: {
  familyId: string;
  userId: string;
  day: string;
  onDone: () => void;
}) {
  const [mood, setMood] = useState<MoodValue | null>(null);
  const [help, setHelp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!mood) return;
    setBusy(true);
    setError(null);
    const result = await submitCheckin({ familyId, userId, day, mood: Number(mood), help });
    setBusy(false);
    if (result === 'error') {
      setError('Couldn’t save your answers. Try again.');
      return;
    }
    // 'already_answered' (another device) still ends in the answered state.
    onDone();
  }

  return (
    <View style={styles.block}>
      <ThemedText type="small">How are you feeling today? (1 = rough, 5 = great)</ThemedText>
      <Segmented options={MOODS} value={mood ?? ('' as MoodValue)} onChange={setMood} />
      <Field
        label="One thing that would help me today"
        value={help}
        onChangeText={setHelp}
        maxLength={HELP_MAX}
        placeholder="An hour of sleep after lunch"
        multiline
        editable={!busy}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Your partner sees your answers once they’ve answered too. Answers can’t be changed later.
      </ThemedText>
      <Button title="Share" onPress={() => void onSubmit()} busy={busy} disabled={!mood} />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

function Answer({ who, checkin }: { who: string; checkin: Checkin }) {
  return (
    <View style={styles.answer}>
      <ThemedText type="small">
        <ThemedText type="smallBold">{who}</ThemedText> · mood {checkin.mood}/5
      </ThemedText>
      {checkin.help ? (
        <ThemedText type="small" themeColor="textSecondary">
          Would help: {checkin.help}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  block: { gap: Spacing.two },
  answer: { gap: Spacing.half },
});
