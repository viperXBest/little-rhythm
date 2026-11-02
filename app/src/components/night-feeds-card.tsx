import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Icon } from '@/components/illustrations';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NightFeeds } from '@/lib/predict';

const TITLE = 'Night feeds logged by each of you';
const NO_PARTNER = 'Your partner’s count appears once they join.';

// Your share in `accent` (periwinkle), your partner's in `feed` (marigold): a different hue
// from accent, ≥ 3:1 on the card in both themes. `sleep` would be confusable (same indigo).
const YOU: ThemeColor = 'accent';
const PARTNER: ThemeColor = 'feed';

// Counts who logged each night feed (22:00–06:00), not who fed the baby: the
// label says so. Computed by the predict function; never sent to the model.
export function NightFeedsCard({ value }: { value: NightFeeds }) {
  const period = `22:00–06:00, last ${value.nights} nights`;
  const summary =
    value.partner !== null
      ? `${period}: You ${value.you}, Your partner ${value.partner}`
      : `${period}: You ${value.you}. ${NO_PARTNER}`;
  return (
    <Card>
      <View style={styles.header}>
        <Icon name="nightFeeds" size={28} />
        {/* Balanced breaks: two even lines instead of "you" alone on the second. */}
        <ThemedText type="cardTitle" accessibilityRole="header" textBreakStrategy="balanced" style={styles.flex}>
          {TITLE}
        </ThemedText>
      </View>
      {/* One TalkBack stop for the numbers; the title above is read as the header. */}
      <View accessible accessibilityLabel={summary} style={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          {period}
        </ThemedText>
        <View style={styles.row}>
          <Count label="You" count={value.you} swatch={value.partner !== null ? YOU : null} />
          {value.partner !== null ? <Count label="Your partner" count={value.partner} swatch={PARTNER} /> : null}
        </View>
        {value.partner !== null ? <Balance you={value.you} partner={value.partner} /> : null}
        {value.partner === null ? (
          <ThemedText type="small" themeColor="textSecondary">
            {NO_PARTNER}
          </ThemedText>
        ) : null}
      </View>
    </Card>
  );
}

function Count({ label, count, swatch }: { label: string; count: number; swatch: ThemeColor | null }) {
  const theme = useTheme();
  return (
    <View style={styles.count}>
      <ThemedText type="display">{count}</ThemedText>
      <View style={styles.legend}>
        {swatch ? <View style={[styles.swatch, { backgroundColor: theme[swatch] }]} /> : null}
        <ThemedText type="smallBold" style={styles.flex}>
          {label}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * Your share and your partner's, split by a thin card-coloured gap. With no night feeds
 * in the period the empty track stays (the counts read 0). The counts carry the numbers.
 */
function Balance({ you, partner }: { you: number; partner: number }) {
  const theme = useTheme();
  const total = you + partner;
  return (
    <View style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {you > 0 ? <View style={{ flex: you, backgroundColor: theme[YOU] }} /> : null}
      {you > 0 && partner > 0 ? <View style={[styles.gap, { backgroundColor: theme.card }]} /> : null}
      {partner > 0 ? <View style={{ flex: partner, backgroundColor: theme[PARTNER] }} /> : null}
      {total === 0 ? <View style={styles.flex} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  body: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.three },
  count: { flex: 1, gap: Spacing.half },
  legend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + Spacing.half },
  swatch: { width: 12, height: 12, borderRadius: Radius.pill },
  bar: { flexDirection: 'row', height: 14, borderRadius: Radius.pill, borderWidth: 1, overflow: 'hidden' },
  gap: { width: 2 },
});
