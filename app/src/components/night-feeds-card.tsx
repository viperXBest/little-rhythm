import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { NightFeeds } from '@/lib/predict';

// Counts who logged each night feed (22:00–06:00), not who fed the baby: the
// label says so. Computed by the predict function; never sent to the model.
export function NightFeedsCard({ value }: { value: NightFeeds }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Night feeds logged by each of you</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        22:00–06:00, last {value.nights} nights
      </ThemedText>
      <View style={styles.row}>
        <Count label="You" count={value.you} />
        {value.partner !== null ? <Count label="Your partner" count={value.partner} /> : null}
      </View>
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

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.four },
  count: { alignItems: 'center', gap: Spacing.half },
});
