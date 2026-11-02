import { router } from 'expo-router';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Shelf } from '@/components/card';
import { Icon, Illustration } from '@/components/illustrations';
import { Empty, ErrorState, Loading } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { MinTouch, Radius, Spacing, Sticker } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeEvent, formatTime, parseFeed, type EventRow } from '@/lib/events';
import { useSession } from '@/lib/session';
import { eventVisual, timelineRowLabel } from '@/lib/timeline-display';
import { useTodayEvents } from '@/lib/today-events';

/** From this font scale the time moves under the title instead of squeezing beside it. */
const STACK_FONT_SCALE = 1.5;
const DISC = 44;

export function Timeline() {
  const { events, status, refresh } = useTodayEvents();

  return (
    <View style={styles.wrap}>
      <ThemedText type="subtitle" accessibilityRole="header">
        Today
      </ThemedText>
      {status === 'error' ? (
        <ErrorState
          message="Couldn’t load today’s log. Check your connection."
          onRetry={() => void refresh()}
          illustration={<Illustration name="error" size={160} />}
        />
      ) : null}
      {events.length > 0 ? null : status === 'loading' ? (
        <Loading label="Loading today’s log…" />
      ) : status === 'ready' ? (
        <Empty illustration={<Illustration name="emptyTimeline" size={200} />}>
          Nothing logged yet today. Use the buttons above, or tell the chat.
        </Empty>
      ) : null}
      {events.map((row) => (
        <TimelineRow key={row.id} row={row} />
      ))}
    </View>
  );
}

function TimelineRow({ row }: { row: EventRow }) {
  const theme = useTheme();
  const { session } = useSession();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_FONT_SCALE;
  const time =
    row.type === 'sleep' && row.ended_at
      ? `${formatTime(row.started_at)}–${formatTime(row.ended_at)}`
      : formatTime(row.started_at);
  const byPartner = row.created_by !== null && row.created_by !== session?.user.id;
  const title = describeEvent(row);
  const visual = eventVisual(row.type, row.type === 'feed' ? parseFeed(row.details)?.kind : null);
  // An ongoing sleep is the one row that is still happening: it takes the soft sleep fill.
  const ongoing = row.type === 'sleep' && row.ended_at === null;
  const timeText = (
    <ThemedText type="button" themeColor="textSecondary" style={stacked ? undefined : styles.time}>
      {time}
    </ThemedText>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={timelineRowLabel(title, time, byPartner)}
      accessibilityHint="Edit or delete"
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: row.id } })}>
      {({ pressed }) => (
        <Shelf
          radius={Radius.button}
          shelf="shelf"
          sunk={pressed}
          faceStyle={[
            styles.row,
            {
              backgroundColor: pressed ? theme.surface : ongoing ? theme.sleepSoft : theme.card,
              borderColor: ongoing ? theme.sleep : theme.border,
            },
          ]}>
          <View style={[styles.disc, { backgroundColor: ongoing ? theme.card : theme[visual.soft] }]}>
            <Icon name={visual.icon} size={26} fill={ongoing ? 'card' : visual.soft} />
          </View>
          <View style={styles.body}>
            <ThemedText type="button">{title}</ThemedText>
            {stacked ? timeText : null}
            {byPartner ? (
              <ThemedText type="small" themeColor="textSecondary">
                by your partner
              </ThemedText>
            ) : null}
          </View>
          {stacked ? null : timeText}
        </Shelf>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
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
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: Spacing.half },
  time: { flexShrink: 0, textAlign: 'right' },
});
