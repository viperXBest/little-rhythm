import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ReminderToggle } from '@/components/reminder-toggle';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { formatTime } from '@/lib/events';
import {
  fetchPrediction,
  type Basis,
  type NullReason,
  type Prediction,
  type PredictError,
  type Slot,
} from '@/lib/predict';
import { syncReminders } from '@/lib/reminders';
import { useTodayEvents } from '@/lib/today-events';

/** Wait for a burst of changes (both breast sides, a partner's edits) to settle. */
const REFRESH_DEBOUNCE_MS = 2000;

const BASIS_TEXT: Record<Basis, string> = {
  personal: 'based on the last 7 days',
  blend: 'based on the last 7 days and age',
  age: 'typical for this age',
};

const REASON_TEXT: Record<NullReason, string> = {
  no_feed_logged: 'Log a feed to see this',
  no_sleep_logged: 'Log a sleep to see this',
  asleep: 'Asleep now',
  bedtime_next: 'Next sleep is bedtime',
  too_young: 'No set bedtime yet',
  night_sleep: 'Night sleep in progress',
  not_asleep: 'Awake',
};

const ERROR_TEXT: Record<PredictError, string> = {
  rate_limited: 'Too many refreshes. Try again in a little while.',
  not_in_family: 'Create a family first.',
  multiple_babies: 'Predictions support one baby per family for now.',
  unknown: 'Couldn’t load what’s next. Check your connection.',
};

type State =
  | { status: 'loading' }
  | { status: 'ready'; prediction: Prediction }
  | { status: 'error'; error: PredictError; last: Prediction | null };

export function NextUp() {
  const { events, status: eventsStatus } = useTodayEvents();
  const [state, setState] = useState<State>({ status: 'loading' });
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const result = await fetchPrediction();
    // A newer request (a later event change) wins.
    if (id !== requestId.current) return;
    if (result.ok) {
      setState({ status: 'ready', prediction: result.prediction });
      // Each fresh prediction replaces this phone's prediction reminders (if on).
      void syncReminders(result.prediction);
    } else {
      setState((prev) => ({
        status: 'error',
        error: result.error,
        last: prev.status === 'ready' ? prev.prediction : prev.status === 'error' ? prev.last : null,
      }));
    }
  }, []);

  // On mount and whenever home comes back into focus.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // After any change to the events (taps, chat confirms, the partner's realtime changes).
  // The first load of today's events is the baseline, not a change.
  const signature = events.map((e) => `${e.id}:${e.started_at}:${e.ended_at ?? ''}`).join('|');
  const lastSignature = useRef<string | null>(null);
  useEffect(() => {
    if (eventsStatus !== 'ready') return;
    const previous = lastSignature.current;
    lastSignature.current = signature;
    if (previous === null || previous === signature) return;
    const timer = setTimeout(() => void load(), REFRESH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [eventsStatus, signature, load]);

  const prediction = state.status === 'ready' ? state.prediction : state.status === 'error' ? state.last : null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Next up</ThemedText>
      {state.status === 'loading' ? (
        <ThemedText themeColor="textSecondary">Working out what’s next…</ThemedText>
      ) : null}
      {state.status === 'error' ? (
        <View style={styles.error}>
          <ThemedText type="small" themeColor="textSecondary">
            {ERROR_TEXT[state.error]}
          </ThemedText>
          <Button title="Try again" variant="secondary" onPress={() => void load()} />
        </View>
      ) : null}
      {prediction ? <Rows prediction={prediction} /> : null}
      <ReminderToggle prediction={prediction} />
    </ThemedView>
  );
}

function Rows({ prediction }: { prediction: Prediction }) {
  const now = useNow();
  const { feed, nap, wake, routine, bedtime } = prediction;
  const awake = wake.reason === 'not_asleep';
  if (feed.reason === 'no_feed_logged' && nap.reason === 'no_sleep_logged') {
    return <ThemedText themeColor="textSecondary">Log a feed or sleep to see what’s next.</ThemedText>;
  }
  return (
    <View style={styles.rows}>
      <Row label="Next feed" slot={feed} now={now} />
      {awake ? <Row label="Next nap" slot={nap} now={now} /> : <Row label="Expected to wake" slot={wake} now={now} />}
      <Row label="Bedtime routine" slot={routine} now={now} />
      <Row label="Bedtime" slot={bedtime} now={now} />
    </View>
  );
}

function Row({ label, slot, now }: { label: string; slot: Slot; now: Date }) {
  const w = slot.window;
  const overdue = w !== null && Date.parse(w.end) < now.getTime();
  return (
    <View style={styles.row}>
      <ThemedText type="small" style={styles.label}>
        {label}
      </ThemedText>
      <View style={styles.value}>
        {w ? (
          <>
            <ThemedText type="smallBold">
              {formatTime(w.start)}–{formatTime(w.end)}
              {overdue ? ' · overdue' : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {BASIS_TEXT[w.basis]}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {REASON_TEXT[slot.reason]}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  error: { gap: Spacing.two },
  rows: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.three },
  label: { flex: 1 },
  value: { flex: 1, alignItems: 'flex-end' },
});
