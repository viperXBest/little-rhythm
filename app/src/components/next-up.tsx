import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { Card, Shelf } from '@/components/card';
import { Icon, Illustration, Mascot, type IconName } from '@/components/illustrations';
import { ReminderToggle } from '@/components/reminder-toggle';
import { Empty, ErrorState, Loading } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, Sticker, TypeScale } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { earliestIndex } from '@/lib/earliest';
import { formatTime } from '@/lib/events';
import {
  fetchPrediction,
  type Basis,
  type NightFeeds,
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
  personal: 'based on the last 7\u00A0days',
  blend: 'based on the last 7\u00A0days and age',
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

/** The predict call also returns the night-feed balance; it is handed up for its own card. */
export function NextUp({ onNightFeeds }: { onNightFeeds?: (value: NightFeeds | null) => void }) {
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
      onNightFeeds?.(result.prediction.nightFeeds);
      // Each fresh prediction replaces this phone's prediction reminders (if on).
      void syncReminders(result.prediction);
    } else {
      setState((prev) => ({
        status: 'error',
        error: result.error,
        last: prev.status === 'ready' ? prev.prediction : prev.status === 'error' ? prev.last : null,
      }));
    }
  }, [onNightFeeds]);

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
    <Card>
      <ThemedText type="cardTitle" accessibilityRole="header">
        Next up
      </ThemedText>
      {state.status === 'loading' ? <Loading label="Working out what’s next…" /> : null}
      {state.status === 'error' ? (
        <ErrorState
          message={ERROR_TEXT[state.error]}
          // Art only when there is nothing else to show; never the mascot next to an error.
          illustration={prediction ? undefined : <Illustration name="error" size={140} />}
          // A missing family or a second baby won't change on retry.
          onRetry={state.error === 'rate_limited' || state.error === 'unknown' ? () => void load() : undefined}
        />
      ) : null}
      {prediction ? <Tiles prediction={prediction} /> : null}
      <ReminderToggle prediction={prediction} />
    </Card>
  );
}

type Tile = { label: string; slot: Slot; tone: 'feed' | 'sleep'; icon: IconName };

/** Tile padding; the column rule below uses it. */
const TILE_PADDING = Spacing.three - Spacing.one;
/** Width of "18:45–" in the `time` type, in ems: one column when a tile can't fit it. */
const RANGE_PIECE_EMS = 3.6;

function Tiles({ prediction }: { prediction: Prediction }) {
  const now = useNow();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const { feed, nap, wake, routine, bedtime } = prediction;
  const awake = wake.reason === 'not_asleep';
  if (feed.reason === 'no_feed_logged' && nap.reason === 'no_sleep_logged') {
    return (
      <Empty illustration={<Mascot pose="cosy" size={96} />}>Log a feed or sleep to see what’s next.</Empty>
    );
  }
  const tiles: Tile[] = [
    { label: 'Next feed', slot: feed, tone: 'feed', icon: 'feed' },
    awake
      ? { label: 'Next nap', slot: nap, tone: 'sleep', icon: 'sleep' }
      : { label: 'Expected to wake', slot: wake, tone: 'sleep', icon: 'wake' },
    { label: 'Bedtime routine', slot: routine, tone: 'sleep', icon: 'sleep' },
    { label: 'Bedtime', slot: bedtime, tone: 'sleep', icon: 'sleep' },
  ];
  const earliest = earliestIndex(tiles.map((t) => t.slot.window));
  // Two columns unless a tile would be too narrow for one half of a range at this font scale.
  const tileInner = (width - Spacing.two) / 2 - 2 * TILE_PADDING - 2 * Sticker.outline;
  const twoColumns = width === 0 || tileInner >= RANGE_PIECE_EMS * TypeScale.time.fontSize * fontScale;
  const rows = twoColumns ? [tiles.slice(0, 2), tiles.slice(2)] : tiles.map((t) => [t]);

  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row.map((tile) => {
            const index = tiles.indexOf(tile);
            return <TileView key={tile.label} tile={tile} now={now} highlighted={index === earliest} />;
          })}
        </View>
      ))}
    </View>
  );
}

function TileView({ tile, now, highlighted }: { tile: Tile; now: Date; highlighted: boolean }) {
  const theme = useTheme();
  const w = tile.slot.window;
  const overdue = w !== null && Date.parse(w.end) < now.getTime();
  const start = w ? formatTime(w.start) : '';
  const end = w ? formatTime(w.end) : '';
  // "· overdue" stays inline while it fits; once it wraps it goes on its own line without the dot,
  // so no line starts with the separator. A new tile width (rotation, font scale) tries inline again.
  const [overdueOwnLine, setOverdueOwnLine] = useState(false);
  const rangeWidth = useRef(0);
  const onRangeLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (rangeWidth.current !== 0 && Math.abs(width - rangeWidth.current) >= 1) setOverdueOwnLine(false);
    rangeWidth.current = width;
  };
  // One element for TalkBack; "earliest" names the highlight without visible copy.
  const spoken = w
    ? `${tile.label}, ${start}–${end}${overdue ? ', overdue' : ''}, ${BASIS_TEXT[w.basis]}${highlighted ? ', earliest' : ''}`
    : `${tile.label}, ${REASON_TEXT[tile.slot.reason]}`;
  return (
    <Shelf
      radius={Radius.small}
      shelf={highlighted ? 'primaryPressed' : null}
      style={[styles.cell, !highlighted && styles.unraised]}
      faceStyle={[
        styles.tile,
        {
          backgroundColor: theme[tile.tone === 'feed' ? 'feedSoft' : 'sleepSoft'],
          borderColor: highlighted ? theme.primary : 'transparent',
        },
      ]}>
      <View accessible accessibilityLabel={spoken} style={styles.tileBody}>
        <View style={styles.tileHead}>
          <Icon name={tile.icon} size={24} fill={tile.tone === 'feed' ? 'feedSoft' : 'sleepSoft'} />
          <ThemedText type="button" style={styles.flex}>
            {tile.label}
          </ThemedText>
        </View>
        {w ? (
          <>
            {/* Separate pieces, so a range wraps only after the en dash. */}
            <View style={styles.range} onLayout={onRangeLayout}>
              <ThemedText type="time">{start}–</ThemedText>
              <ThemedText type="time">{end}</ThemedText>
              {overdue && !overdueOwnLine ? (
                <ThemedText
                  type="smallBold"
                  onLayout={(e) => {
                    // A wrapped piece starts at the row's left edge.
                    if (e.nativeEvent.layout.x < 1) setOverdueOwnLine(true);
                  }}>
                  {' '}
                  · overdue
                </ThemedText>
              ) : null}
            </View>
            {overdue && overdueOwnLine ? <ThemedText type="smallBold">overdue</ThemedText> : null}
            <ThemedText type="caption" themeColor="textSecondary" textBreakStrategy="balanced">
              {BASIS_TEXT[w.basis]}
            </ThemedText>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {REASON_TEXT[tile.slot.reason]}
          </ThemedText>
        )}
      </View>
    </Shelf>
  );
}

const styles = StyleSheet.create({
  grid: { gap: Spacing.two },
  gridRow: { flexDirection: 'row', gap: Spacing.two },
  cell: { flex: 1 },
  // Unhighlighted tiles reserve the shelf's 4 px, so both tiles in a row line up.
  unraised: { paddingBottom: Sticker.shelf },
  tile: { flex: 1, borderWidth: Sticker.outline, padding: TILE_PADDING },
  tileBody: { gap: Spacing.one },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flexShrink: 1 },
  range: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
});
