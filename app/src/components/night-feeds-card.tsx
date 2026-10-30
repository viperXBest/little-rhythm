import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NightFeeds } from '@/lib/predict';

// Counts who logged each night feed (22:00–06:00), not who fed the baby: the
// label says so. Computed by the predict function; never sent to the model.
export function NightFeedsCard({ value }: { value: NightFeeds }) {
  return (
    <ThemedView type="surface" style={styles.card}>
      <ThemedText type="smallBold">Night feeds logged by each of you</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        22:00–06:00, last {value.nights} nights
      </ThemedText>
      <View style={styles.row}>
        <Count label="You" count={value.you} />
        {value.partner !== null ? <Count label="Your partner" count={value.partner} /> : null}
      </View>
      {value.partner !== null ? <Balance you={value.you} partner={value.partner} /> : null}
      {value.partner === null ? (
        <ThemedText type="small" themeColor="textSecondary">
          Your partner’s count appears once they join.
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

function Count({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.count}>
      <ThemedText type="subtitle">{count}</ThemedText>
      <ThemedText type="small">{label}</ThemedText>
    </View>
  );
}

/** Your share in the accent colour, your partner's in the border grey. The counts above carry the numbers. */
function Balance({ you, partner }: { you: number; partner: number }) {
  const theme = useTheme();
  const total = you + partner;
  if (total === 0) return null;
  return (
    <View
      accessible
      accessibilityLabel={`You logged ${you} of ${total} night feeds`}
      style={[styles.bar, { backgroundColor: theme.border }]}>
      <View style={{ flex: you, backgroundColor: theme.accent }} />
      <View style={{ flex: partner }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.four },
  count: { alignItems: 'center', gap: Spacing.half },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
});
