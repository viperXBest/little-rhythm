import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/card';
import { Segmented, Stepper } from '@/components/controls';
import { Button, ErrorText } from '@/components/form';
import { Icon } from '@/components/illustrations';
import { ThemedText } from '@/components/themed-text';
import { MinTouch, Radius, Spacing, Sticker } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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

/** Font scale from which Start sleep and Feed stack instead of sitting side by side. */
const STACK_FONT_SCALE = 1.6;

/** Icon on a quick-log button: white on primary in light, the dark-glare tint look in dark. */
function TintIcon({ name }: { name: 'sleep' | 'feed' | 'wake' }) {
  return <Icon name={name} size={28} color="primaryTintIcon" fill="primaryTintPressed" />;
}

export function QuickLog() {
  const { session, family } = useSession();
  const { add, openSleep } = useTodayEvents();
  const { fontScale } = useWindowDimensions();
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

  // The two big buttons share a row; an open sleep, the feed panel or a large font stacks them.
  // The tree is the same in both layouts, so nothing remounts mid-tap.
  const sideBySide = !openSleep && !feedOpen && fontScale < STACK_FONT_SCALE;

  return (
    <View style={styles.wrap}>
      <View style={sideBySide ? styles.row : styles.wrap}>
        <View style={sideBySide ? styles.cell : undefined}>
          <SleepCard
            onStart={async () => {
              // add() refetches on conflict, so the card switches to the partner's sleep.
              if ((await log('sleep')) === 'sleep_already_open') {
                setError('Your partner already started a sleep. Tap “Woke up” to end it.');
              }
            }}
            onError={setError}
          />
        </View>
        <View style={sideBySide ? styles.cell : undefined}>
          {feedOpen ? (
            <FeedPanel
              onCancel={() => setFeedOpen(false)}
              onLog={async (details) => {
                if (!(await log('feed', details))) setFeedOpen(false);
              }}
            />
          ) : (
            <Button
              title="Feed"
              variant="tint"
              size="large"
              icon={<TintIcon name="feed" />}
              onPress={() => setFeedOpen(true)}
            />
          )}
        </View>
      </View>
      <Card padding={Spacing.two + Spacing.one} style={styles.diaper}>
        <View style={styles.diaperLabel}>
          <Icon name="diaper" size={28} />
          <ThemedText type="buttonLarge">Diaper</ThemedText>
        </View>
        <View style={styles.diaperChoices}>
          <DiaperChoice title="Wet" onPress={() => void log('diaper', { wet: true, dirty: false })} />
          <DiaperChoice title="Dirty" onPress={() => void log('diaper', { wet: false, dirty: true })} />
          <DiaperChoice title="Both" onPress={() => void log('diaper', { wet: true, dirty: true })} />
        </View>
      </Card>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

/** One diaper choice: a soft aqua tile, 52 dp tall, label in the button type. */
function DiaperChoice({ title, onPress }: { title: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: pressed ? theme.border : theme.diaperSoft, borderColor: theme.border },
      ]}>
      <ThemedText type="button" style={styles.center}>
        {title}
      </ThemedText>
    </Pressable>
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
    return (
      <Button
        title="Start sleep"
        variant="tint"
        size="large"
        icon={<TintIcon name="sleep" />}
        onPress={() => void run(onStart)}
        busy={busy}
      />
    );
  }

  const byPartner = openSleep.created_by !== session?.user.id;
  return (
    <Card tone="sleepSoft">
      <View style={styles.asleepHead}>
        <Icon name="sleep" size={32} fill="sleepSoft" />
        <ThemedText type="cardTitle" style={styles.shrink}>
          Asleep {formatDuration(now.getTime() - Date.parse(openSleep.started_at))}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        Since {formatTime(openSleep.started_at)}
        {byPartner ? ', started by your partner' : ''}
      </ThemedText>
      <Button
        title="Woke up"
        variant="tint"
        size="large"
        icon={<TintIcon name="wake" />}
        busy={busy}
        onPress={() =>
          void run(async () => {
            onError(null);
            if (await endSleep(openSleep.id)) onError(SAVE_FAILED);
          })
        }
      />
    </Card>
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
    <Card style={styles.panel}>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three },
  cell: { flex: 1 },
  asleepHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  shrink: { flexShrink: 1 },
  panel: { gap: Spacing.three },
  diaper: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.two },
  diaperLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexGrow: 1,
    paddingHorizontal: Spacing.two,
    minHeight: MinTouch,
  },
  diaperChoices: { flexDirection: 'row', gap: Spacing.two, flexGrow: 1 },
  choice: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 60,
    minHeight: MinTouch + Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: Sticker.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
});
