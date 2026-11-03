import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { Card } from '@/components/card';
import { Icon } from '@/components/illustrations';
import { ThemedText } from '@/components/themed-text';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { niceMax, type TrendDay } from '@/lib/trends';

export type TrendTone = 'feed' | 'sleep' | 'diaper';

export type TrendSeries = {
  name: string;
  tone: TrendTone;
  /** Drawn as an outline on the soft fill instead of a solid bar, so two series differ by more than hue. */
  outlined?: boolean;
  /** One value per day, in the order of `days`. */
  values: readonly number[];
};

type TrendBarsProps = {
  title: string;
  days: readonly TrendDay[];
  series: readonly TrendSeries[];
  /** The chart top is at least this (so a single feed is not a full-height bar). */
  minTop: number;
  /** The chart top as text, e.g. "15 h". */
  topLabel: (top: number) => string;
  /** The text alternative: every day's numbers, read as one image by a screen reader. */
  summary: string;
  /** A short fixed line under the chart (what is and isn't counted). */
  note?: string;
};

const SOFT: Record<TrendTone, ThemeColor> = { feed: 'feedSoft', sleep: 'sleepSoft', diaper: 'diaperSoft' };

const PLOT_HEIGHT = 120;
/** The baseline is a 2 dp line; bars stand on it. */
const BASE = 2;
const MIN_BAR = 4;
const BAR_GAP = 2;
const MAX_BAR_WIDTH = 22;
/** The axis labels stay readable but can't outgrow their room; the day-by-day list scales fully. */
const AXIS_MAX_FONT_SCALE = 1.2;
/** Below this much room (dp) for a label the weekday is one letter. */
const NARROW_BELOW = 36;

/**
 * Bars per day, hand-drawn with react-native-svg in event colours from the theme. One image for screen
 * readers: `summary` is its text alternative. The axis labels are not text-scaled past 1.2x; the
 * numbers are all in the day-by-day list under the charts.
 */
export function TrendBars({ title, days, series, minTop, topLabel, summary, note }: TrendBarsProps) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const tone = series[0].tone;
  const top = niceMax(Math.max(minTop, ...series.flatMap((s) => s.values)));
  const columnWidth = days.length > 0 ? width / days.length : 0;
  const groupWidth = Math.min(
    columnWidth * 0.72,
    series.length * MAX_BAR_WIDTH + (series.length - 1) * BAR_GAP,
  );
  const barWidth = (groupWidth - (series.length - 1) * BAR_GAP) / series.length;
  const floor = PLOT_HEIGHT - BASE;
  const room = floor - 2;
  // 14 days: every other label, ending with today. A shown label is centred over its column and
  // spreads over the empty one beside it, so it has `labelEvery` columns of room.
  const labelEvery = days.length > 7 ? 2 : 1;
  const labelWidth = columnWidth * labelEvery;

  return (
    <Card>
      <View style={styles.header}>
        <Icon name={tone} size={28} />
        <ThemedText type="cardTitle" accessibilityRole="header" style={styles.title}>
          {title}
        </ThemedText>
      </View>
      <ThemedText type="caption" themeColor="textSecondary">
        Chart top: {topLabel(top)}
      </ThemedText>
      <View accessible accessibilityRole="image" accessibilityLabel={summary}>
        <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 ? (
            <Svg width={width} height={PLOT_HEIGHT}>
              <Line
                x1={0}
                x2={width}
                y1={0.5}
                y2={0.5}
                stroke={theme.border}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              {days.flatMap((day, i) =>
                series.map((s, k) => {
                  const value = s.values[i] ?? 0;
                  if (!(value > 0)) return null;
                  const height = Math.max(MIN_BAR, (value / top) * room);
                  const x = i * columnWidth + (columnWidth - groupWidth) / 2 + k * (barWidth + BAR_GAP);
                  const y = floor - height;
                  const radius = Math.min(4, barWidth / 2);
                  return s.outlined ? (
                    // The 2 dp outline sits inside the bar's box.
                    <Rect
                      key={`${day.date}-${s.name}`}
                      x={x + 1}
                      y={y + 1}
                      width={Math.max(0, barWidth - 2)}
                      height={Math.max(0, height - 2)}
                      rx={radius}
                      fill={theme[SOFT[s.tone]]}
                      stroke={theme[s.tone]}
                      strokeWidth={2}
                    />
                  ) : (
                    <Rect
                      key={`${day.date}-${s.name}`}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={height}
                      rx={radius}
                      fill={theme[s.tone]}
                    />
                  );
                }),
              )}
              <Line
                x1={0}
                x2={width}
                y1={PLOT_HEIGHT - BASE / 2}
                y2={PLOT_HEIGHT - BASE / 2}
                stroke={theme.border}
                strokeWidth={BASE}
              />
            </Svg>
          ) : (
            <View style={{ height: PLOT_HEIGHT }} />
          )}
        </View>
        <View style={styles.axis}>
          {days.map((day, i) => (
            <View key={day.date} style={styles.cell}>
              {width > 0 && (days.length - 1 - i) % labelEvery === 0 ? (
                <AxisLabel day={day} width={labelWidth} />
              ) : null}
            </View>
          ))}
        </View>
      </View>
      {series.length > 1 ? (
        <View style={styles.legend}>
          {series.map((s) => (
            <View key={s.name} style={styles.legendItem}>
              <View
                style={[
                  styles.swatch,
                  s.outlined
                    ? { backgroundColor: theme[SOFT[s.tone]], borderColor: theme[s.tone], borderWidth: 2 }
                    : { backgroundColor: theme[s.tone] },
                ]}
              />
              <ThemedText type="small">{s.name}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}
      {note ? (
        <ThemedText type="caption" themeColor="textSecondary">
          {note}
        </ThemedText>
      ) : null}
    </Card>
  );
}

/** The weekday and the date under a bar, centred in `width` (which may reach past its own column). */
function AxisLabel({ day, width }: { day: TrendDay; width: number }) {
  const date = new Date(day.startMs);
  const weekday = date.toLocaleDateString([], { weekday: width < NARROW_BELOW ? 'narrow' : 'short' });
  const text = (value: string | number) => (
    <ThemedText
      type="caption"
      themeColor={day.isToday ? 'text' : 'textSecondary'}
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.75}
      maxFontSizeMultiplier={AXIS_MAX_FONT_SCALE}
      style={[styles.label, { width }]}>
      {value}
    </ThemedText>
  );
  return (
    <>
      {text(weekday)}
      {text(date.getDate())}
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  title: { flexShrink: 1 },
  axis: { flexDirection: 'row', paddingTop: Spacing.one },
  cell: { flex: 1, alignItems: 'center' },
  label: { textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three, rowGap: Spacing.one },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 16, height: 16, borderRadius: 4 },
});
