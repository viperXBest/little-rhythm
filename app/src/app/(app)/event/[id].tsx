import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Segmented, Stepper } from '@/components/controls';
import { DateField } from '@/components/date-field';
import { Button, ErrorText, Screen } from '@/components/form';
import { ErrorState, Loading } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import {
  MINUTES_RANGE,
  ML_RANGE,
  parseDiaper,
  parseFeed,
  type BreastSide,
  type EventPatch,
  type EventRow,
  type FeedDetails,
} from '@/lib/events';
import { useTodayEvents } from '@/lib/today-events';

// Allow a little clock drift between the two phones.
const FUTURE_SLACK_MS = 60_000;

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
        <ThemedText type="subtitle">Edit</ThemedText>
        <ErrorState message="Couldn’t load today’s log. Check your connection." onRetry={() => void refresh()} />
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!row) {
    // Deleted (here or on the partner's phone) or no longer today.
    return (
      <Screen>
        <ThemedText type="subtitle">Event not found</ThemedText>
        <ThemedText themeColor="textSecondary">It may have been deleted.</ThemedText>
        <Button title="Back" onPress={() => router.back()} />
      </Screen>
    );
  }
  return <EditForm key={row.id} row={row} />;
}

function EditForm({ row }: { row: EventRow }) {
  const { update, remove } = useTodayEvents();
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

  function validate(): string | null {
    const latest = Date.now() + FUTURE_SLACK_MS;
    if (startedAt.getTime() > latest) return 'The start can’t be in the future.';
    if (endedAt) {
      if (endedAt.getTime() > latest) return 'The end can’t be in the future.';
      if (endedAt < startedAt) return 'The end must be after the start.';
    }
    return null;
  }

  async function onSave() {
    const invalid = validate();
    if (invalid) {
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
    setError(null);
    setBusy(true);
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

  const now = new Date();
  return (
    <Screen>
      <ThemedText type="subtitle">{title}</ThemedText>
      <DateField
        label={row.type === 'sleep' ? 'Fell asleep' : 'Time'}
        mode="datetime"
        value={startedAt}
        onChange={setStartedAt}
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
            <Stepper label="Amount" value={ml} onChange={setMl} step={10} min={ML_RANGE.min} max={ML_RANGE.max} unit="ml" />
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
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={() => void onSave()} busy={busy} />
      <Button title="Delete" variant="secondary" onPress={onDelete} />
      <Button title="Cancel" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
