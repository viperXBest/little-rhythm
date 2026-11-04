import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, ToastAndroid, View } from 'react-native';

import { Card } from '@/components/card';
import { Segmented, Stepper } from '@/components/controls';
import { DateField } from '@/components/date-field';
import { Button, ErrorText, Screen } from '@/components/form';
import { Icon, Illustration } from '@/components/illustrations';
import { ErrorState, Loading } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { birthDayStart, savedForText, type EntryDraft } from '@/lib/entry-time';
import {
  checkEntry,
  MINUTES_RANGE,
  ML_RANGE,
  overlapsDay,
  parseDiaper,
  parseFeed,
  startOfToday,
  type BreastSide,
  type EventPatch,
  type EventRow,
  type FeedDetails,
} from '@/lib/events';
import { useSession } from '@/lib/session';
import { eventVisual } from '@/lib/timeline-display';
import { useTodayEvents } from '@/lib/today-events';

export default function EditEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { find, status, refresh } = useTodayEvents();
  const row = typeof id === 'string' ? find(id) : undefined;

  if (!row && status === 'loading') {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (!row && status === 'error') {
    return (
      <Screen>
        <ThemedText type="title" accessibilityRole="header">
          Edit
        </ThemedText>
        <ErrorState
          message="Couldn’t load today’s log. Check your connection."
          onRetry={() => void refresh()}
          illustration={<Illustration name="error" size={180} />}
        />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!row) {
    // Deleted (here or on the partner's phone) or no longer today.
    return (
      <Screen>
        <ThemedText type="title" accessibilityRole="header">
          Event not found
        </ThemedText>
        <ThemedText themeColor="textSecondary">It may have been deleted.</ThemedText>
        <Button title="Back" onPress={() => router.back()} />
      </Screen>
    );
  }
  return <EditForm key={row.id} row={row} />;
}

function EditForm({ row }: { row: EventRow }) {
  const theme = useTheme();
  const { family } = useSession();
  const { update, remove } = useTodayEvents();
  const birthDate = family?.baby.birthDate ?? null;
  const birthStart = birthDayStart(birthDate) ?? undefined;
  const feed = row.type === 'feed' ? parseFeed(row.details) : null;
  const diaper = row.type === 'diaper' ? parseDiaper(row.details) : null;

  const [startedAt, setStartedAt] = useState(new Date(row.started_at));
  const [endedAt, setEndedAt] = useState<Date | null>(row.ended_at ? new Date(row.ended_at) : null);
  const [feedKind, setFeedKind] = useState<FeedDetails['kind']>(feed?.kind ?? 'bottle');
  const [ml, setMl] = useState(feed?.kind === 'bottle' ? feed.ml : 90);
  const [side, setSide] = useState<BreastSide>(feed?.kind === 'breast' ? feed.side : 'left');
  const [minutes, setMinutes] = useState(feed?.kind === 'breast' ? feed.minutes : 15);
  const [diaperKind, setDiaperKind] = useState<'wet' | 'dirty' | 'both'>(
    diaper ? (diaper.wet && diaper.dirty ? 'both' : diaper.wet ? 'wet' : 'dirty') : 'wet',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = row.type === 'feed' ? 'Feed' : row.type === 'sleep' ? 'Sleep' : 'Diaper';

  /** The same rules as a new entry (entry-time.ts); a sleep also must not overlap another one. */
  async function validate(): Promise<string | null> {
    const base = { start: startedAt, birthDate };
    const draft: EntryDraft =
      row.type === 'feed'
        ? {
            type: 'feed',
            ...base,
            feed: feedKind === 'bottle' ? { kind: 'bottle', ml } : { kind: 'breast', minutes },
          }
        : row.type === 'sleep'
          ? { type: 'sleep', ...base, end: endedAt, allowOpen: row.ended_at === null, ignoreId: row.id }
          : { type: 'diaper', ...base };
    return (await checkEntry(row.baby_id, draft))?.message ?? null;
  }

  async function onSave() {
    setError(null);
    setBusy(true);
    const invalid = await validate();
    if (invalid) {
      setBusy(false);
      setError(invalid);
      return;
    }
    const patch: EventPatch = { started_at: startedAt.toISOString() };
    if (row.type === 'sleep') patch.ended_at = endedAt ? endedAt.toISOString() : null;
    if (row.type === 'feed') {
      patch.details = feedKind === 'bottle' ? { kind: 'bottle', ml } : { kind: 'breast', side, minutes };
    }
    if (row.type === 'diaper') {
      patch.details = { wet: diaperKind !== 'dirty', dirty: diaperKind !== 'wet' };
    }
    const result = await update(row.id, patch);
    setBusy(false);
    if (result) {
      setError(
        row.type === 'sleep' && patch.ended_at === null
          ? 'Could not save. Another sleep may already be ongoing.'
          : 'Could not save. Check your connection and try again.',
      );
      return;
    }
    // Home lists today only: say so when the event moved to another day (TalkBack announces a toast).
    if (!overlapsDay({ ...row, ...patch }, startOfToday())) {
      ToastAndroid.show(savedForText(startedAt), ToastAndroid.SHORT);
    }
    router.back();
  }

  function onDelete() {
    Alert.alert(`Delete this ${title.toLowerCase()}?`, 'It disappears for both of you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            if (await remove(row.id)) {
              setError('Could not delete. Check your connection and try again.');
              return;
            }
            router.back();
          })(),
      },
    ]);
  }

  const visual = eventVisual(row.type, row.type === 'feed' ? feedKind : null);
  const now = new Date();
  return (
    <Screen>
      <View style={styles.header}>
        <View style={[styles.disc, { backgroundColor: theme[visual.soft] }]}>
          <Icon name={visual.icon} size={32} fill={visual.soft} />
        </View>
        <ThemedText type="title" accessibilityRole="header" style={styles.flex}>
          {title}
        </ThemedText>
      </View>
      <Card style={styles.card}>
        <DateField
          label={row.type === 'sleep' ? 'Fell asleep' : 'Time'}
          mode="datetime"
          value={startedAt}
          onChange={setStartedAt}
          minimumDate={birthStart}
          maximumDate={now}
        />
        {row.type === 'sleep' ? (
          <>
            <DateField
              label="Woke up"
              mode="datetime"
              value={endedAt}
              onChange={setEndedAt}
              placeholder="Still asleep"
              minimumDate={startedAt}
              maximumDate={now}
            />
            {endedAt && row.ended_at === null ? (
              <Button title="Still asleep" variant="secondary" onPress={() => setEndedAt(null)} />
            ) : null}
          </>
        ) : null}
        {row.type === 'feed' ? (
          <>
            <Segmented
              options={[
                { value: 'bottle', label: 'Bottle' },
                { value: 'breast', label: 'Breast' },
              ]}
              value={feedKind}
              onChange={setFeedKind}
            />
            {feedKind === 'bottle' ? (
              <Stepper
                label="Amount"
                value={ml}
                onChange={setMl}
                step={10}
                min={ML_RANGE.min}
                max={ML_RANGE.max}
                unit="ml"
              />
            ) : (
              <>
                <Segmented
                  options={[
                    { value: 'left', label: 'Left' },
                    { value: 'right', label: 'Right' },
                  ]}
                  value={side}
                  onChange={setSide}
                />
                <Stepper
                  label="Duration"
                  value={minutes}
                  onChange={setMinutes}
                  step={5}
                  min={MINUTES_RANGE.min}
                  max={MINUTES_RANGE.max}
                  unit="min"
                />
              </>
            )}
          </>
        ) : null}
        {row.type === 'diaper' ? (
          <Segmented
            options={[
              { value: 'wet', label: 'Wet' },
              { value: 'dirty', label: 'Dirty' },
              { value: 'both', label: 'Both' },
            ]}
            value={diaperKind}
            onChange={setDiaperKind}
          />
        ) : null}
      </Card>
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={() => void onSave()} busy={busy} />
      <Button title="Cancel" variant="quiet" onPress={() => router.back()} />
      {/* Delete sits apart from Save, so the two fills never read as a pair. */}
      <View style={styles.danger}>
        <Button
          title="Delete"
          variant="danger"
          onPress={onDelete}
          icon={<Icon name="delete" size={22} color="onPrimary" fill="error" />}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  disc: { width: 56, height: 56, borderRadius: Radius.small, alignItems: 'center', justifyContent: 'center' },
  flex: { flexShrink: 1 },
  card: { gap: Spacing.three },
  danger: { marginTop: Spacing.four },
});
