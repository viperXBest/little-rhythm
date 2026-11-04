import { useState } from 'react';
import { Pressable, StyleSheet, ToastAndroid, useWindowDimensions, View } from 'react-native';

import { Card } from '@/components/card';
import { Segmented, Stepper } from '@/components/controls';
import { DateField } from '@/components/date-field';
import { Button, ErrorText } from '@/components/form';
import { Icon } from '@/components/illustrations';
import { ThemedText } from '@/components/themed-text';
import { MinTouch, Radius, Spacing, Sticker } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { birthDayStart, savedForText, type EntryDraft } from '@/lib/entry-time';
import {
  checkEntry,
  formatDuration,
  formatTime,
  MINUTES_RANGE,
  ML_RANGE,
  newEventRow,
  overlapsDay,
  startOfToday,
  type BreastSide,
  type DiaperDetails,
  type EventType,
  type FeedDetails,
  type WriteError,
} from '@/lib/events';
import { useSession } from '@/lib/session';
import { useTodayEvents } from '@/lib/today-events';

const SAVE_FAILED = 'Could not save. Check your connection and try again.';

/** An entry from a log sheet. A start left null means "now", read at the moment of saving. */
type Entry =
  | { type: 'feed'; startedAt: Date | null; details: FeedDetails }
  | { type: 'diaper'; startedAt: Date | null; details: DiaperDetails }
  | { type: 'sleep'; startedAt: Date; endedAt: Date | null };

/** Font scale from which Start sleep and Feed stack instead of sitting side by side. */
const STACK_FONT_SCALE = 1.6;

const DIAPER_CHOICES: readonly { title: string; details: DiaperDetails }[] = [
  { title: 'Wet', details: { wet: true, dirty: false } },
  { title: 'Dirty', details: { wet: false, dirty: true } },
  { title: 'Both', details: { wet: true, dirty: true } },
];

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
  const [pastSleepOpen, setPastSleepOpen] = useState(false);

  if (!session || !family) return null;
  const userId = session.user.id;
  const babyId = family.baby.id;
  const birthDate = family.baby.birthDate;
  const birthStart = birthDayStart(birthDate) ?? undefined;

  // The one-tap path: always now, so there is nothing to check.
  async function log(type: EventType, details?: FeedDetails | DiaperDetails): Promise<WriteError | null> {
    setError(null);
    const result = await add(newEventRow({ babyId, userId, type, startedAt: new Date(), details }));
    if (result === 'failed') setError(SAVE_FAILED);
    return result;
  }

  /**
   * Saves an entry from a log sheet after the rules in entry-time.ts. Returns the message to show when it
   * was not saved, else null. Home lists today only, so an entry for another day gets a toast (TalkBack
   * announces it).
   */
  async function save(entry: Entry): Promise<string | null> {
    setError(null);
    const startedAt = entry.startedAt ?? new Date();
    const draft: EntryDraft =
      entry.type === 'feed'
        ? { type: 'feed', start: startedAt, birthDate, feed: entry.details }
        : entry.type === 'diaper'
          ? { type: 'diaper', start: startedAt, birthDate }
          : { type: 'sleep', start: startedAt, end: entry.endedAt, birthDate };
    const problem = await checkEntry(babyId, draft);
    if (problem) return problem.message;
    const row = newEventRow({
      babyId,
      userId,
      type: entry.type,
      startedAt,
      endedAt: entry.type === 'sleep' ? entry.endedAt : null,
      details: entry.type === 'sleep' ? undefined : entry.details,
    });
    if (await add(row)) return SAVE_FAILED;
    if (!overlapsDay(row, startOfToday())) ToastAndroid.show(savedForText(startedAt), ToastAndroid.SHORT);
    return null;
  }

  // The two big buttons share a row; an open sleep, a log sheet or a large font stacks them.
  // The block remounts when the layout flips (the key). Reused, the flattened layout-only wrappers kept the
  // other layout's frames on Android, so after a feed Start sleep was a narrow tall tile and Feed ran off the
  // screen. A remount can't drop a save: every save runs in this component's or the context's closures, and
  // the Feed panel, the only child with its own state, is open only while the block is already stacked.
  const sideBySide = !openSleep && !feedOpen && fontScale < STACK_FONT_SCALE;
  // The diaper label sits left of its choices below the stack scale; above it, the choices go under the label.
  const diaperInline = fontScale < STACK_FONT_SCALE;

  return (
    <View style={styles.wrap}>
      <View key={sideBySide ? 'row' : 'stack'} style={sideBySide ? styles.row : styles.wrap}>
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
              birthStart={birthStart}
              onCancel={() => setFeedOpen(false)}
              onLog={async (details, startedAt) => {
                const message = await save({ type: 'feed', startedAt, details });
                if (!message) setFeedOpen(false);
                return message;
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
      {pastSleepOpen ? (
        <PastSleepPanel
          birthStart={birthStart}
          onCancel={() => setPastSleepOpen(false)}
          onSave={async (startedAt, endedAt) => {
            const message = await save({ type: 'sleep', startedAt, endedAt });
            if (!message) setPastSleepOpen(false);
            return message;
          }}
        />
      ) : (
        <Button
          title="Add a past sleep"
          variant="quiet"
          accessibilityHint="Opens start and end time fields"
          onPress={() => setPastSleepOpen(true)}
        />
      )}
      <DiaperCard
        inline={diaperInline}
        birthStart={birthStart}
        onTap={(details) => void log('diaper', details)}
        onSaveEarlier={(details, startedAt) => save({ type: 'diaper', startedAt, details })}
      />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

/** Diaper: Wet, Dirty and Both are one tap at now; "Earlier…" opens the same choices for a past time. */
function DiaperCard({
  inline,
  birthStart,
  onTap,
  onSaveEarlier,
}: {
  inline: boolean;
  birthStart: Date | undefined;
  onTap: (details: DiaperDetails) => void;
  onSaveEarlier: (details: DiaperDetails, startedAt: Date | null) => Promise<string | null>;
}) {
  const [earlierOpen, setEarlierOpen] = useState(false);
  return (
    <Card padding={Spacing.two + Spacing.one}>
      {earlierOpen ? (
        <EarlierDiaper
          birthStart={birthStart}
          onCancel={() => setEarlierOpen(false)}
          onSave={async (details, startedAt) => {
            const message = await onSaveEarlier(details, startedAt);
            if (!message) setEarlierOpen(false);
            return message;
          }}
        />
      ) : (
        <>
          <View style={inline ? styles.diaper : styles.diaperStacked}>
            <DiaperLabel />
            <View style={[styles.diaperChoices, inline ? styles.diaperChoicesInline : styles.diaperChoicesStacked]}>
              {DIAPER_CHOICES.map((choice) => (
                <DiaperChoice
                  key={choice.title}
                  title={choice.title}
                  hint="Logs it now"
                  onPress={() => onTap(choice.details)}
                />
              ))}
            </View>
          </View>
          <Button
            title="Earlier…"
            variant="quiet"
            accessibilityLabel="Log an earlier diaper"
            accessibilityHint="Opens a time field and the diaper choices"
            onPress={() => setEarlierOpen(true)}
          />
        </>
      )}
    </Card>
  );
}

function DiaperLabel() {
  return (
    <View style={styles.diaperLabel}>
      <Icon name="diaper" size={28} />
      <ThemedText type="buttonLarge" accessibilityRole="header">
        Diaper
      </ThemedText>
    </View>
  );
}

/** A diaper for another time: the time says Now until changed, then tap what it was. */
function EarlierDiaper({
  birthStart,
  onSave,
  onCancel,
}: {
  birthStart: Date | undefined;
  /** `startedAt` null = now, read when saving. */
  onSave: (details: DiaperDetails, startedAt: Date | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [time, setTime] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(details: DiaperDetails) {
    if (busy) return;
    setBusy(true);
    setError(await onSave(details, time));
    setBusy(false);
  }

  return (
    <View style={styles.panel}>
      <DiaperLabel />
      <DateField
        label="Time"
        mode="datetime"
        on="card"
        value={time}
        onChange={setTime}
        placeholder="Now"
        emptyAction="Change ›"
        minimumDate={birthStart}
        maximumDate={new Date()}
      />
      <View style={[styles.diaperChoices, styles.diaperChoicesStacked]}>
        {DIAPER_CHOICES.map((choice) => (
          <DiaperChoice
            key={choice.title}
            title={choice.title}
            hint={time ? 'Logs it at the time above' : 'Logs it now'}
            busy={busy}
            onPress={() => void submit(choice.details)}
          />
        ))}
      </View>
      <ErrorText>{error}</ErrorText>
      <Button
        title="Cancel"
        variant="secondary"
        accessibilityHint="Closes this without saving"
        onPress={onCancel}
      />
    </View>
  );
}

/** One diaper choice: a soft aqua tile, 52 dp tall, label in the button type. */
function DiaperChoice({
  title,
  hint,
  busy = false,
  onPress,
}: {
  title: string;
  hint: string;
  /** True while a save is under way: the tile is disabled and dimmed. */
  busy?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={hint}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { backgroundColor: pressed ? theme.border : theme.diaperSoft, borderColor: theme.border },
        busy && styles.dimmed,
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

/** A sleep that already happened: when it started and when it ended. */
function PastSleepPanel({
  birthStart,
  onSave,
  onCancel,
}: {
  birthStart: Date | undefined;
  onSave: (startedAt: Date, endedAt: Date | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!start) {
      setError('Choose when the sleep started.');
      return;
    }
    setBusy(true);
    setError(await onSave(start, end));
    setBusy(false);
  }

  const now = new Date();
  return (
    <Card style={styles.panel}>
      <ThemedText type="cardTitle" accessibilityRole="header">
        Past sleep
      </ThemedText>
      <DateField
        label="Fell asleep"
        mode="datetime"
        on="card"
        value={start}
        onChange={setStart}
        minimumDate={birthStart}
        maximumDate={now}
      />
      <DateField
        label="Woke up"
        mode="datetime"
        on="card"
        value={end}
        onChange={setEnd}
        initialValue={start ?? undefined}
        minimumDate={start ?? birthStart}
        maximumDate={now}
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title="Save sleep"
        accessibilityHint="Saves the sleep with the times above"
        onPress={() => void submit()}
        busy={busy}
      />
      <Button
        title="Cancel"
        variant="secondary"
        accessibilityHint="Closes this without saving"
        onPress={onCancel}
      />
    </Card>
  );
}

function FeedPanel({
  birthStart,
  onLog,
  onCancel,
}: {
  birthStart: Date | undefined;
  /** `startedAt` null = now, read when saving. Resolves to the message to show when it was not saved. */
  onLog: (details: FeedDetails, startedAt: Date | null) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<FeedDetails['kind']>('bottle');
  const [ml, setMl] = useState(90);
  const [side, setSide] = useState<BreastSide>('left');
  const [minutes, setMinutes] = useState(15);
  const [time, setTime] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(await onLog(kind === 'bottle' ? { kind, ml } : { kind, side, minutes }, time));
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
      <DateField
        label="Time"
        mode="datetime"
        on="card"
        value={time}
        onChange={setTime}
        placeholder="Now"
        emptyAction="Change ›"
        minimumDate={birthStart}
        maximumDate={new Date()}
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title={time ? 'Log feed' : 'Log feed now'}
        accessibilityHint={time ? 'Logs the feed at the time above' : 'Logs the feed now'}
        onPress={() => void submit()}
        busy={busy}
      />
      <Button
        title="Cancel"
        variant="secondary"
        accessibilityHint="Closes this without saving"
        onPress={onCancel}
      />
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
  diaper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  diaperStacked: { gap: Spacing.two },
  diaperLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
    minHeight: MinTouch,
  },
  diaperChoices: { flexDirection: 'row', gap: Spacing.two },
  // Side by side the choices take the width left of the label; stacked they size to their content.
  diaperChoicesInline: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  diaperChoicesStacked: { flexBasis: 'auto', alignSelf: 'stretch' },
  choice: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: MinTouch + Spacing.one,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: Sticker.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  dimmed: { opacity: 0.6 },
});
