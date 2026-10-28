import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Segmented, Stepper } from '@/components/controls';
import { Button, ErrorText } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import {
  formatDuration,
  formatTime,
  MINUTES_RANGE,
  ML_RANGE,
  newEventRow,
  type BreastSide,
  type DiaperDetails,
  type EventType,
  type FeedDetails,
  type WriteError,
} from '@/lib/events';
import { useSession } from '@/lib/session';
import { useTodayEvents } from '@/lib/today-events';

const SAVE_FAILED = 'Could not save. Check your connection and try again.';

export function QuickLog() {
  const { session, family } = useSession();
  const { add } = useTodayEvents();
  const [error, setError] = useState<string | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);

  if (!session || !family) return null;
  const userId = session.user.id;
  const babyId = family.baby.id;

  async function log(type: EventType, details?: FeedDetails | DiaperDetails): Promise<WriteError | null> {
    setError(null);
    const result = await add(newEventRow({ babyId, userId, type, startedAt: new Date(), details }));
    if (result === 'failed') setError(SAVE_FAILED);
    return result;
  }

  return (
    <View style={styles.wrap}>
      <SleepCard
        onStart={async () => {
          // add() refetches on conflict, so the card switches to the partner's sleep.
          if ((await log('sleep')) === 'sleep_already_open') {
            setError('Your partner already started a sleep. Tap “Woke up” to end it.');
          }
        }}
        onError={setError}
      />
      {feedOpen ? (
        <FeedPanel
          onCancel={() => setFeedOpen(false)}
          onLog={async (details) => {
            if (!(await log('feed', details))) setFeedOpen(false);
          }}
        />
      ) : (
        <View style={styles.row}>
          <View style={styles.cell}>
            <Button title="Feed" onPress={() => setFeedOpen(true)} />
          </View>
        </View>
      )}
      <ThemedText type="smallBold">Diaper</ThemedText>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Button title="Wet" variant="secondary" onPress={() => void log('diaper', { wet: true, dirty: false })} />
        </View>
        <View style={styles.cell}>
          <Button title="Dirty" variant="secondary" onPress={() => void log('diaper', { wet: false, dirty: true })} />
        </View>
        <View style={styles.cell}>
          <Button title="Both" variant="secondary" onPress={() => void log('diaper', { wet: true, dirty: true })} />
        </View>
      </View>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

function SleepCard({ onStart, onError }: { onStart: () => Promise<void>; onError: (e: string | null) => void }) {
  const { session } = useSession();
  const { openSleep, endSleep, now } = useTodayEvents();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    await action();
    setBusy(false);
  }

  if (!openSleep) {
    return <Button title="Start sleep" onPress={() => void run(onStart)} busy={busy} />;
  }

  const byPartner = openSleep.created_by !== session?.user.id;
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">
        Asleep {formatDuration(now.getTime() - Date.parse(openSleep.started_at))}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Since {formatTime(openSleep.started_at)}
        {byPartner ? ', started by your partner' : ''}
      </ThemedText>
      <Button
        title="Woke up"
        busy={busy}
        onPress={() =>
          void run(async () => {
            onError(null);
            if (await endSleep(openSleep.id)) onError(SAVE_FAILED);
          })
        }
      />
    </ThemedView>
  );
}

function FeedPanel({ onLog, onCancel }: { onLog: (details: FeedDetails) => Promise<void>; onCancel: () => void }) {
  const [kind, setKind] = useState<FeedDetails['kind']>('bottle');
  const [ml, setMl] = useState(90);
  const [side, setSide] = useState<BreastSide>('left');
  const [minutes, setMinutes] = useState(15);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    await onLog(kind === 'bottle' ? { kind, ml } : { kind, side, minutes });
    setBusy(false);
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Segmented
        options={[
          { value: 'bottle', label: 'Bottle' },
          { value: 'breast', label: 'Breast' },
        ]}
        value={kind}
        onChange={setKind}
      />
      {kind === 'bottle' ? (
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
      <Button title="Log feed now" onPress={() => void submit()} busy={busy} />
      <Button title="Cancel" variant="secondary" onPress={onCancel} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  cell: { flex: 1 },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
});
