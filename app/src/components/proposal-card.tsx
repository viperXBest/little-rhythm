import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Segmented, Stepper } from '@/components/controls';
import { DateField } from '@/components/date-field';
import { Button, ErrorText } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { proposalToRow, type ChatSource, type Proposal, type ProposalError } from '@/lib/chat';
import {
  formatTime,
  MINUTES_RANGE,
  ML_RANGE,
  type BreastSide,
  type FeedDetails,
} from '@/lib/events';
import { useSession } from '@/lib/session';
import { useTodayEvents } from '@/lib/today-events';

// Same slack as the event editor: the two phones' clocks may drift a little.
const FUTURE_SLACK_MS = 60_000;

const TITLES: Record<Proposal['type'], string> = {
  feed: 'Feed',
  sleep: 'Sleep',
  sleep_end: 'Woke up',
  diaper: 'Diaper',
};

const FIELD_LABELS: Record<string, string> = {
  started_at: 'Time',
  ended_at: 'End',
  kind: 'Bottle or breast',
  ml: 'Amount',
  side: 'Side',
  minutes: 'Duration',
  details: 'Diaper',
  sleep: 'Sleep',
  arguments: 'Details',
};

function errorMessage(error: ProposalError): string {
  const label = FIELD_LABELS[error.field] ?? 'A field';
  switch (error.code) {
    case 'in_future':
      return `${label}: that time is in the future. Pick when it happened.`;
    case 'too_old':
      return `${label}: only the last 48 hours can be logged here.`;
    case 'invalid_time':
    case 'required':
      return `${label}: please set it.`;
    case 'out_of_range':
      return error.field === 'ml'
        ? `Amount: must be ${ML_RANGE.min}–${ML_RANGE.max} ml. Check it.`
        : `Duration: must be ${MINUTES_RANGE.min}–${MINUTES_RANGE.max} min. Check it.`;
    case 'before_start':
      return 'The end must be after the start.';
    case 'wet_or_dirty':
      return 'Diaper: choose wet, dirty or both.';
    case 'no_open_sleep':
      return 'There is no sleep in progress to end.';
    case 'sleep_already_open':
      return 'A sleep is already in progress. Set when this one ended, or discard it.';
    case 'invalid_arguments':
      return 'I couldn’t read the details. Fill them in.';
    default:
      return `${label}: please check it.`;
  }
}

type Props = {
  proposal: Proposal;
  source: ChatSource;
  onSaved: (summary: string) => void;
  onDiscard: () => void;
};

export function ProposalCard({ proposal, source, onSaved, onDiscard }: Props) {
  const { session, family } = useSession();
  const { add, endSleep, find } = useTodayEvents();

  const feed = proposal.type === 'feed' ? proposal.details : null;
  const diaper = proposal.type === 'diaper' ? proposal.details : null;

  const [startedAt, setStartedAt] = useState<Date | null>(
    proposal.started_at ? new Date(proposal.started_at) : null,
  );
  const [endedAt, setEndedAt] = useState<Date | null>(
    proposal.type === 'sleep' || proposal.type === 'sleep_end'
      ? proposal.ended_at
        ? new Date(proposal.ended_at)
        : null
      : null,
  );
  const [feedKind, setFeedKind] = useState<FeedDetails['kind']>(feed?.kind ?? 'bottle');
  const [ml, setMl] = useState(feed?.ml ?? 90);
  const [side, setSide] = useState<BreastSide>(feed?.side ?? 'left');
  const [minutes, setMinutes] = useState(feed?.minutes ?? 15);
  const [diaperKind, setDiaperKind] = useState<'wet' | 'dirty' | 'both'>(
    diaper?.wet && diaper.dirty ? 'both' : diaper?.dirty ? 'dirty' : 'wet',
  );
  // Server errors stay until the parent edits that field.
  const [serverErrors, setServerErrors] = useState<ProposalError[]>(proposal.errors);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function edited(...fields: string[]) {
    setServerErrors((prev) => prev.filter((e) => !fields.includes(e.field) && e.field !== 'arguments'));
    setError(null);
  }

  // A missing sleep can't be fixed on the card: only discard.
  const unfixable = serverErrors.some((e) => e.code === 'no_open_sleep');

  function localError(): string | null {
    const latest = Date.now() + FUTURE_SLACK_MS;
    if (proposal.type === 'sleep_end') {
      if (!endedAt) return 'Set the wake-up time.';
      if (endedAt.getTime() > latest) return 'The end can’t be in the future.';
      if (proposal.started_at && endedAt < new Date(proposal.started_at)) {
        return 'The end must be after the start.';
      }
      return null;
    }
    if (!startedAt) return 'Set the time.';
    if (startedAt.getTime() > latest) return 'The time can’t be in the future.';
    if (proposal.type === 'sleep' && endedAt) {
      if (endedAt.getTime() > latest) return 'The end can’t be in the future.';
      if (endedAt < startedAt) return 'The end must be after the start.';
    }
    return null;
  }

  async function onConfirm() {
    const invalid = localError();
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!session || !family) return;
    setBusy(true);
    setError(null);

    if (proposal.type === 'sleep_end') {
      const sleepId = proposal.sleep_id;
      const sleep = sleepId ? find(sleepId) : undefined;
      if (!sleepId || !sleep || !endedAt) {
        setBusy(false);
        setError('That sleep is no longer in today’s log.');
        return;
      }
      if (sleep.ended_at !== null) {
        setBusy(false);
        setError('Your partner already ended this sleep.');
        return;
      }
      const result = await endSleep(sleepId, endedAt);
      setBusy(false);
      if (result) {
        setError('Could not save. Check your connection and try again.');
        return;
      }
      onSaved(`Woke up · ${formatTime(endedAt.toISOString())}`);
      return;
    }

    if (!startedAt) return;
    const details: FeedDetails =
      feedKind === 'bottle' ? { kind: 'bottle', ml } : { kind: 'breast', side, minutes };
    const row = proposalToRow({
      type: proposal.type,
      babyId: family.baby.id,
      userId: session.user.id,
      source,
      startedAt,
      endedAt,
      feed: details,
      diaper: { wet: diaperKind !== 'dirty', dirty: diaperKind !== 'wet' },
    });
    const result = await add(row);
    setBusy(false);
    if (result === 'sleep_already_open') {
      setError('A sleep is already in progress. Set when this one ended, or discard it.');
      return;
    }
    if (result) {
      setError('Could not save. Check your connection and try again.');
      return;
    }
    onSaved(`${summary(proposal.type, details, diaperKind)} · ${formatTime(startedAt.toISOString())}`);
  }

  const now = new Date();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">{TITLES[proposal.type]}</ThemedText>
      {serverErrors.map((e) => (
        <ErrorText key={`${e.field}:${e.code}`}>{errorMessage(e)}</ErrorText>
      ))}

      {proposal.type === 'sleep_end' ? (
        <>
          {proposal.started_at ? (
            <ThemedText type="small" themeColor="textSecondary">
              Asleep since {formatTime(proposal.started_at)}
            </ThemedText>
          ) : null}
          {unfixable ? null : (
            <DateField
              label="Woke up"
              mode="datetime"
              value={endedAt}
              onChange={(value) => {
                setEndedAt(value);
                edited('ended_at');
              }}
              minimumDate={proposal.started_at ? new Date(proposal.started_at) : undefined}
              maximumDate={now}
            />
          )}
        </>
      ) : (
        <DateField
          label={proposal.type === 'sleep' ? 'Fell asleep' : 'Time'}
          mode="datetime"
          value={startedAt}
          onChange={(value) => {
            setStartedAt(value);
            edited('started_at');
          }}
          maximumDate={now}
        />
      )}

      {proposal.type === 'sleep' ? (
        <>
          <DateField
            label="Woke up"
            mode="datetime"
            value={endedAt}
            onChange={(value) => {
              setEndedAt(value);
              edited('ended_at');
            }}
            placeholder="Still asleep"
            minimumDate={startedAt ?? undefined}
            maximumDate={now}
          />
          {endedAt ? (
            <Button
              title="Still asleep"
              variant="secondary"
              onPress={() => {
                setEndedAt(null);
                edited('ended_at');
              }}
            />
          ) : null}
        </>
      ) : null}

      {proposal.type === 'feed' ? (
        <>
          <Segmented
            options={[
              { value: 'bottle', label: 'Bottle' },
              { value: 'breast', label: 'Breast' },
            ]}
            value={feedKind}
            onChange={(value) => {
              setFeedKind(value);
              edited('kind');
            }}
          />
          {feedKind === 'bottle' ? (
            <Stepper
              label="Amount"
              value={ml}
              onChange={(value) => {
                setMl(value);
                edited('ml');
              }}
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
                onChange={(value) => {
                  setSide(value);
                  edited('side');
                }}
              />
              <Stepper
                label="Duration"
                value={minutes}
                onChange={(value) => {
                  setMinutes(value);
                  edited('minutes');
                }}
                step={5}
                min={MINUTES_RANGE.min}
                max={MINUTES_RANGE.max}
                unit="min"
              />
            </>
          )}
        </>
      ) : null}

      {proposal.type === 'diaper' ? (
        <Segmented
          options={[
            { value: 'wet', label: 'Wet' },
            { value: 'dirty', label: 'Dirty' },
            { value: 'both', label: 'Both' },
          ]}
          value={diaperKind}
          onChange={(value) => {
            setDiaperKind(value);
            edited('details');
          }}
        />
      ) : null}

      <ErrorText>{error}</ErrorText>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            title="Confirm"
            onPress={() => void onConfirm()}
            busy={busy}
            disabled={unfixable || serverErrors.length > 0}
          />
        </View>
        <View style={styles.action}>
          <Button title="Discard" variant="secondary" onPress={onDiscard} disabled={busy} />
        </View>
      </View>
    </ThemedView>
  );
}

function summary(
  type: 'feed' | 'sleep' | 'diaper',
  feed: FeedDetails,
  diaper: 'wet' | 'dirty' | 'both',
): string {
  if (type === 'feed') {
    return feed.kind === 'bottle' ? `Bottle · ${feed.ml} ml` : `Breast · ${feed.side} · ${feed.minutes} min`;
  }
  if (type === 'diaper') return `Diaper · ${diaper === 'both' ? 'wet and dirty' : diaper}`;
  return 'Sleep';
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  action: { flex: 1 },
});
