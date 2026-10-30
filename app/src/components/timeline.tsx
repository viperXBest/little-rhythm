import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Empty, ErrorState, Loading } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeEvent, formatTime, type EventRow } from '@/lib/events';
import { useSession } from '@/lib/session';
import { useTodayEvents } from '@/lib/today-events';

export function Timeline() {
  const { events, status, refresh } = useTodayEvents();

  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold">Today</ThemedText>
      {status === 'error' ? (
        <ErrorState message="Couldn’t load today’s log. Check your connection." onRetry={() => void refresh()} />
      ) : null}
      {events.length > 0 ? null : status === 'loading' ? (
        <Loading label="Loading today’s log…" />
      ) : status === 'ready' ? (
        <Empty>Nothing logged yet today. Use the buttons above, or tell the chat.</Empty>
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
  const time =
    row.type === 'sleep' && row.ended_at
      ? `${formatTime(row.started_at)}–${formatTime(row.ended_at)}`
      : formatTime(row.started_at);
  const byPartner = row.created_by !== null && row.created_by !== session?.user.id;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="Edit or delete"
      onPress={() => router.push({ pathname: '/event/[id]', params: { id: row.id } })}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.surface },
        pressed && styles.dimmed,
      ]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.time}>
        {time}
      </ThemedText>
      <View style={styles.body}>
        <ThemedText type="small">{describeEvent(row)}</ThemedText>
        {byPartner ? (
          <ThemedText type="small" themeColor="textSecondary">
            by your partner
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  time: { minWidth: 96 },
  body: { flex: 1 },
  dimmed: { opacity: 0.6 },
});
