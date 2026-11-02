import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { Card } from '@/components/card';
import { Button, ErrorText, Field } from '@/components/form';
import { Icon, Illustration } from '@/components/illustrations';
import { ErrorState, Loading } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { MinTouch, Radius, Spacing, Sticker } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
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

// Visible labels stay the bare numbers; TalkBack hears the scale from the question
// ("1 = rough, 5 = great"), so the ends carry those words and the middle says "of 5".
const MOODS = [
  { value: 1, a11y: '1 of 5, rough' },
  { value: 2, a11y: '2 of 5' },
  { value: 3, a11y: '3 of 5' },
  { value: 4, a11y: '4 of 5' },
  { value: 5, a11y: '5 of 5, great' },
] as const;
type MoodValue = (typeof MOODS)[number]['value'];

const QUESTION = 'How are you feeling today? (1 = rough, 5 = great)';

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
    <Card>
      <View style={styles.header}>
        <Icon name="checkin" size={28} />
        <ThemedText type="cardTitle" accessibilityRole="header" style={styles.flex}>
          Daily check-in
        </ThemedText>
      </View>
      {state.status === 'loading' ? <Loading label="Loading today’s check-in…" /> : null}
      {state.status === 'error' ? (
        <ErrorState
          message="Couldn’t load the check-in. Check your connection."
          onRetry={() => void load()}
          illustration={<Illustration name="error" size={140} />}
        />
      ) : null}
      {state.status === 'ready' && !mine ? (
        <CheckinForm familyId={family.id} userId={userId} day={state.day} onDone={load} />
      ) : null}
      {mine ? (
        family.memberCount < 2 ? (
          <View style={styles.block}>
            <Answer who="You" checkin={mine} />
            <ThemedText type="small" themeColor="textSecondary">
              Invite your partner to share check-ins.
            </ThemedText>
          </View>
        ) : partner ? (
          <Reveal mine={mine} partner={partner} />
        ) : (
          <View style={styles.block}>
            <Answer who="You" checkin={mine} />
            <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Illustration name="checkinWaiting" size={160} />
            </View>
            <ThemedText type="small" themeColor="textSecondary" accessibilityLiveRegion="polite">
              Waiting for your partner. Their answers appear here once they answer.
            </ThemedText>
          </View>
        )
      ) : null}
    </Card>
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
  onDone: () => Promise<void>;
}) {
  const [mood, setMood] = useState<MoodValue | null>(null);
  const [help, setHelp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (!mood) return;
    setBusy(true);
    setError(null);
    const result = await submitCheckin({ familyId, userId, day, mood, help });
    if (result === 'error') {
      setBusy(false);
      setError('Couldn’t save your answers. Try again.');
      return;
    }
    // 'already_answered' (another device) still ends in the answered state. Stay busy
    // until the reload shows the answers, so the form doesn't flash back.
    await onDone();
    setBusy(false);
  }

  return (
    <View style={styles.block}>
      <ThemedText type="small">{QUESTION}</ThemedText>
      <MoodPicker value={mood} onChange={setMood} disabled={busy} />
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

/** Five big round choices, single-select (a radiogroup of radios). */
function MoodPicker({
  value,
  onChange,
  disabled,
}: {
  value: MoodValue | null;
  onChange: (value: MoodValue) => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={QUESTION} style={styles.moods}>
      {MOODS.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={option.a11y}
            accessibilityState={{ selected, checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.mood,
              {
                backgroundColor: selected ? theme.primary : pressed ? theme.border : theme.surface,
                borderColor: selected ? theme.primaryPressed : theme.border,
              },
              disabled && !selected && styles.dimmed,
            ]}>
            <ThemedText type="time" style={{ color: selected ? theme.onPrimary : theme.text }}>
              {option.value}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Both answers side by side: the small moment once you have both answered. */
function Reveal({ mine, partner }: { mine: Checkin; partner: Checkin }) {
  const reduceMotion = useReducedMotion();
  // Side by side at normal sizes; large text stacks them (the basis grows with the font scale).
  const basis = { flexBasis: 150 * useWindowDimensions().fontScale };
  const enter = (delay: number) => (reduceMotion ? undefined : FadeInDown.duration(420).delay(delay));
  return (
    <View style={styles.reveal}>
      <Animated.View entering={enter(0)} style={[styles.revealItem, basis]}>
        <Answer who="You" checkin={mine} boxed />
      </Animated.View>
      <Animated.View entering={enter(160)} style={[styles.revealItem, basis]}>
        <Answer who="Your partner" checkin={partner} boxed />
      </Animated.View>
    </View>
  );
}

function Answer({ who, checkin, boxed = false }: { who: string; checkin: Checkin; boxed?: boolean }) {
  const label = `${who} · mood ${checkin.mood}/5${checkin.help ? `. Would help: ${checkin.help}` : ''}`;
  const body = (
    <>
      <ThemedText type="smallBold">{who}</ThemedText>
      <View style={styles.moodLine}>
        <ThemedText type="small" themeColor="textSecondary">
          mood{' '}
        </ThemedText>
        <ThemedText type="time">{checkin.mood}/5</ThemedText>
      </View>
      {checkin.help ? (
        <ThemedText type="small" themeColor="textSecondary">
          Would help: {checkin.help}
        </ThemedText>
      ) : null}
    </>
  );
  if (!boxed) {
    return (
      <View accessible accessibilityLabel={label} style={styles.answer}>
        {body}
      </View>
    );
  }
  return (
    <Card tone="surface" raised={false} radius={Radius.button} accessible accessibilityLabel={label} style={styles.answer}>
      {body}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  block: { gap: Spacing.three },
  art: { alignItems: 'center' },
  moods: { flexDirection: 'row', gap: Spacing.two },
  mood: {
    flex: 1,
    minHeight: MinTouch + Spacing.two,
    borderRadius: Radius.button,
    borderWidth: Sticker.outline,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
  },
  dimmed: { opacity: 0.5 },
  reveal: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  revealItem: { flexGrow: 1 },
  answer: { gap: Spacing.half },
  moodLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
});
