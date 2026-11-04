import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BackHeader } from '@/components/account-ui';
import { Card, Shelf } from '@/components/card';
import { Chip } from '@/components/controls';
import { Button, Screen } from '@/components/form';
import { GrowthChart } from '@/components/growth-chart';
import { GrowthForm, type GrowthFormValues } from '@/components/growth-form';
import { Illustration } from '@/components/illustrations';
import { Empty, ErrorState, Loading } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { MinTouch, Radius, Spacing, Sticker } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGrowth, type GrowthPatch, type GrowthRow, type GrowthWriteError } from '@/lib/growth';
import {
  chartPoints,
  formatDay,
  formatWithUnit,
  GROWTH_KINDS,
  GROWTH_SPECS,
  newestFirst,
  type GrowthKind,
} from '@/lib/growth-values';
import { useSession } from '@/lib/session';

/** From this font scale the value moves under the date instead of squeezing beside it. */
const STACK_FONT_SCALE = 1.5;

const SAVE_FAILED = 'Could not save. Check your connection and try again.';
const SAVE_REJECTED = 'This value or date can’t be saved.';
const DELETE_FAILED = 'Could not delete. Check your connection and try again.';

function saveMessage(failure: GrowthWriteError): string {
  return failure === 'rejected' ? SAVE_REJECTED : SAVE_FAILED;
}

// The only line under the numbers. Nothing on this screen says what they mean.
const RECORDS_LINE = 'For your records. Your paediatrician interprets growth.';

/**
 * `start` is the measurement as it was when the form opened. The form edits and saves against that
 * snapshot, not the live row, so a partner's change that arrives meanwhile is not undone by a Save
 * that changes nothing of its own.
 */
type Editing = { kind: GrowthKind; id: string | null; start: GrowthFormValues | null };

/** Weight, length and head circumference: a plain log with one line chart per measure. */
export default function Growth() {
  const { family } = useSession();
  if (!family) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  return <GrowthScreen babyId={family.baby.id} birthDate={family.baby.birthDate} />;
}

function GrowthScreen({ babyId, birthDate }: { babyId: string; birthDate: string }) {
  const growth = useGrowth(babyId);
  const [kind, setKind] = useState<GrowthKind>('weight');
  // The form replaces the list, so the keyboard handling of Screen leaves Save in view.
  const [editing, setEditing] = useState<Editing | null>(null);
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_FONT_SCALE;

  // The hardware back button closes the form first.
  useEffect(() => {
    if (!editing) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setEditing(null);
      return true;
    });
    return () => sub.remove();
  }, [editing]);

  if (editing) {
    const row = editing.id ? growth.find(editing.id) : undefined;
    if (editing.id && !row) {
      // Deleted on the partner's phone while this form was open.
      return (
        <Screen top>
          <ThemedText type="title" accessibilityRole="header">
            Measurement not found
          </ThemedText>
          <ThemedText themeColor="textSecondary">It may have been deleted.</ThemedText>
          <Button title="Back" onPress={() => setEditing(null)} />
        </Screen>
      );
    }
    return (
      <Screen top>
        <GrowthForm
          key={editing.id ?? 'new'}
          kind={editing.kind}
          birthDate={birthDate}
          initial={editing.start}
          onCancel={() => setEditing(null)}
          onSave={async ({ value, measuredOn }) => {
            if (!row || !editing.start) {
              const failure = await growth.add({ kind: editing.kind, value, measuredOn });
              if (failure) return saveMessage(failure);
              setKind(editing.kind);
              setEditing(null);
              return null;
            }
            // Only what this form changed is sent.
            const patch: GrowthPatch = {};
            if (value !== editing.start.value) patch.value = value;
            if (measuredOn !== editing.start.measuredOn) patch.measured_on = measuredOn;
            if (Object.keys(patch).length > 0) {
              const failure = await growth.update(row.id, patch);
              if (failure) return saveMessage(failure);
            }
            setEditing(null);
            return null;
          }}
          onDelete={
            row
              ? async () => {
                  if (await growth.remove(row.id)) return DELETE_FAILED;
                  setEditing(null);
                  return null;
                }
              : undefined
          }
        />
      </Screen>
    );
  }

  const spec = GROWTH_SPECS[kind];
  const list = newestFirst(growth.rows, kind);
  const points = chartPoints(growth.rows, kind);
  const latest = list[0];
  return (
    <Screen top>
      <BackHeader title="Growth" />
      <View style={styles.chips}>
        {GROWTH_KINDS.map((k) => (
          <Chip
            key={k}
            label={GROWTH_SPECS[k].label}
            selected={k === kind}
            onPress={() => setKind(k)}
            accessibilityLabel={GROWTH_SPECS[k].title}
          />
        ))}
      </View>

      {growth.status === 'error' && growth.rows.length === 0 ? (
        <ErrorState
          message="Couldn’t load the growth log. Check your connection."
          onRetry={() => void growth.refresh()}
          illustration={<Illustration name="error" size={180} />}
        />
      ) : growth.status === 'loading' ? (
        <Loading label="Loading the growth log…" />
      ) : (
        <>
          <Card>
            <View style={stacked ? styles.cardHeadStacked : styles.cardHead}>
              <ThemedText type="cardTitle" accessibilityRole="header" style={styles.flex}>
                {spec.title}
              </ThemedText>
              {latest ? (
                <View style={stacked ? styles.latestStacked : styles.latest}>
                  <ThemedText type="time">{formatWithUnit(kind, latest.value)}</ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {formatDay(latest.measured_on, true)}
                  </ThemedText>
                </View>
              ) : null}
            </View>
            {points.length > 0 ? (
              <GrowthChart kind={kind} points={points} />
            ) : (
              <Empty>{`No ${spec.noun} logged yet.`}</Empty>
            )}
          </Card>
          <Button title={`Add ${spec.noun}`} onPress={() => setEditing({ kind, id: null, start: null })} />
          {list.map((row) => (
            <GrowthRowItem
              key={row.id}
              row={row}
              kind={kind}
              onPress={() =>
                setEditing({ kind, id: row.id, start: { value: row.value, measuredOn: row.measured_on } })
              }
            />
          ))}
        </>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        {RECORDS_LINE}
      </ThemedText>
    </Screen>
  );
}

function GrowthRowItem({ row, kind, onPress }: { row: GrowthRow; kind: GrowthKind; onPress: () => void }) {
  const theme = useTheme();
  const { session } = useSession();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_FONT_SCALE;
  const date = formatDay(row.measured_on, true);
  const value = formatWithUnit(kind, row.value);
  const byPartner = row.created_by !== null && row.created_by !== session?.user.id;
  const valueText = (
    <ThemedText type="button" themeColor="textSecondary" style={stacked ? undefined : styles.value}>
      {value}
    </ThemedText>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${value}, ${date}${byPartner ? ', by your partner' : ''}`}
      accessibilityHint="Edit or delete"
      onPress={onPress}>
      {({ pressed }) => (
        <Shelf
          radius={Radius.button}
          shelf="shelf"
          sunk={pressed}
          faceStyle={[
            styles.row,
            { backgroundColor: pressed ? theme.surface : theme.card, borderColor: theme.border },
          ]}>
          <View style={styles.body}>
            <ThemedText type="button">{date}</ThemedText>
            {stacked ? valueText : null}
            {byPartner ? (
              <ThemedText type="small" themeColor="textSecondary">
                by your partner
              </ThemedText>
            ) : null}
          </View>
          {stacked ? null : valueText}
        </Shelf>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.two },
  // From a large font scale the title and the latest value stack, so neither is squeezed.
  cardHeadStacked: { gap: Spacing.one },
  flex: { flexShrink: 1 },
  latest: { alignItems: 'flex-end', flexShrink: 0 },
  latestStacked: { alignItems: 'flex-start' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MinTouch + Spacing.three,
    borderRadius: Radius.button,
    borderWidth: Sticker.outline,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
  },
  body: { flex: 1, gap: Spacing.half },
  value: { flexShrink: 0, textAlign: 'right' },
});
