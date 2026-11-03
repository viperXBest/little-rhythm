import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackHeader } from '@/components/account-ui';
import { Card } from '@/components/card';
import { Segmented } from '@/components/controls';
import { Screen } from '@/components/form';
import { Illustration } from '@/components/illustrations';
import { Empty, ErrorState, Loading } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TrendBars } from '@/components/trend-bars';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import {
  bottleText,
  buildTrends,
  countLabel,
  dayHasData,
  diapersText,
  feedsText,
  hasTrendData,
  sleepHours,
  sleepText,
  type TrendDay,
  type TrendRange,
  unitLabel,
} from '@/lib/trends';
import { useTrendEvents } from '@/lib/trends-data';

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
] as const;
type RangeKey = (typeof RANGES)[number]['value'];

const ERROR_TEXT = 'Couldn’t load the log. Check your connection.';
const STALE_TEXT = 'Couldn’t refresh. These are the numbers from the last time it loaded.';

export default function Trends() {
  const { family } = useSession();
  if (!family) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  return <TrendsView babyId={family.baby.id} />;
}

/** "Mon, 3 Nov", with "today so far" for today, whose totals are partial. */
function dayTitle(day: TrendDay): string {
  const text = new Date(day.startMs).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return day.isToday ? `${text} (today so far)` : text;
}

/** The chart's text alternative: each day's value. */
function summaryOf(title: string, days: readonly TrendDay[], text: (day: TrendDay) => string): string {
  return `${title} per day. ${days.map((day) => `${dayTitle(day)}: ${text(day)}`).join('. ')}.`;
}

function TrendsView({ babyId }: { babyId: string }) {
  const theme = useTheme();
  const now = useNow();
  const [rangeKey, setRangeKey] = useState<RangeKey>('7');
  const range: TrendRange = rangeKey === '14' ? 14 : 7;
  const { status, events, stale, refreshing, refresh, retry } = useTrendEvents(babyId, now);
  const days = useMemo(() => buildTrends(events, range, now), [events, range, now]);

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              colors={[theme.primary]}
              progressBackgroundColor={theme.card}
            />
          }>
          <BackHeader title="Trends" />
          <ThemedText themeColor="textSecondary">Counts and totals from your log. Today is partial.</ThemedText>
          <Segmented
            accessibilityLabel="Days shown"
            options={RANGES}
            value={rangeKey}
            onChange={setRangeKey}
          />
          {status === 'loading' ? <Loading label="Loading the log…" /> : null}
          {status === 'error' ? (
            <ErrorState message={ERROR_TEXT} onRetry={retry} illustration={<Illustration name="error" size={160} />} />
          ) : null}
          {/* Pull-to-refresh has no TalkBack action, so the failure carries its own button. */}
          {stale ? <ErrorState message={STALE_TEXT} onRetry={retry} /> : null}
          {status === 'ready' && !hasTrendData(days) ? (
            <Empty illustration={<Illustration name="emptyTimeline" size={200} />}>
              Nothing logged in these days
            </Empty>
          ) : null}
          {status === 'ready' && hasTrendData(days) ? <Charts days={days} /> : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Charts({ days }: { days: readonly TrendDay[] }) {
  return (
    <>
      <TrendBars
        title="Feeds"
        days={days}
        series={[{ name: 'Feeds', tone: 'feed', values: days.map((d) => d.feeds) }]}
        minTop={4}
        topLabel={(top) => countLabel(top, 'feed')}
        summary={summaryOf('Feeds', days, feedsText)}
      />
      <TrendBars
        title="Bottle"
        days={days}
        series={[{ name: 'Bottle ml', tone: 'feed', values: days.map((d) => d.bottleMl) }]}
        minTop={100}
        topLabel={(top) => unitLabel(top, 'ml')}
        summary={summaryOf('Bottle ml', days, bottleText)}
        note="Bottle feeds only. Breast feeds have no ml."
      />
      <TrendBars
        title="Sleep"
        days={days}
        series={[{ name: 'Sleep hours', tone: 'sleep', values: days.map((d) => sleepHours(d.sleepMs)) }]}
        minTop={4}
        topLabel={(top) => unitLabel(top, 'h')}
        summary={summaryOf('Sleep', days, sleepText)}
        note="Time asleep inside each day; a sleep over midnight is split between the two days."
      />
      <TrendBars
        title="Diapers"
        days={days}
        series={[
          { name: 'Wet', tone: 'diaper', values: days.map((d) => d.wet) },
          { name: 'Dirty', tone: 'diaper', outlined: true, values: days.map((d) => d.dirty) },
        ]}
        minTop={4}
        topLabel={(top) => countLabel(top, 'diaper')}
        summary={summaryOf('Diapers', days, diapersText)}
        note="A diaper that is both counts as wet and as dirty."
      />
      <DayByDay days={days} />
    </>
  );
}

/** Every number as text, newest day first: the readable version of the charts at any text size. */
function DayByDay({ days }: { days: readonly TrendDay[] }) {
  const theme = useTheme();
  const newestFirst = [...days].reverse();
  return (
    <Card>
      <ThemedText type="cardTitle" accessibilityRole="header">
        Day by day
      </ThemedText>
      {newestFirst.map((day, i) => {
        const lines = !dayHasData(day)
          ? ['Nothing logged']
          : [`${feedsText(day)}, ${bottleText(day)}`, `Sleep ${sleepText(day)}`, diapersText(day)];
        return (
          <View
            key={day.date}
            accessible
            accessibilityLabel={`${dayTitle(day)}. ${lines.join('. ')}`}
            style={[styles.dayRow, i > 0 && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
            <ThemedText type="smallBold">{dayTitle(day)}</ThemedText>
            {lines.map((line) => (
              <ThemedText key={line} type="small" themeColor="textSecondary">
                {line}
              </ThemedText>
            ))}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  dayRow: { gap: Spacing.half, paddingTop: Spacing.two },
});
