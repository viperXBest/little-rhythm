import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  chartAltText,
  formatDay,
  formatValue,
  GROWTH_SPECS,
  layoutChart,
  type ChartPoint,
  type GrowthKind,
} from '@/lib/growth-values';

const PLOT_HEIGHT = 168;
/** Room at the sides for the dots (and the axis), in dp. */
const SIDE = 12;
/** Caption text is 13 dp on an 18 dp line; both scale with the system font size. */
const CAPTION_LINE = 18;
const CAPTION_SIZE = 13;

/**
 * One plain line chart: the measurements of one kind over time, hand-drawn with react-native-svg.
 * No reference lines, bands, percentiles or norms; only the two axes, the line and the dots. The axis
 * numbers and dates are real text (they follow the system font size); the picture is one image for
 * screen readers, described by `chartAltText`, and the list under the chart holds every value.
 */
export function GrowthChart({ kind, points }: { kind: GrowthKind; points: readonly ChartPoint[] }) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  if (points.length === 0) return null;

  // Half a caption line, so a label centred on an axis end stays inside the chart.
  const half = Math.ceil((CAPTION_LINE * fontScale) / 2);
  const pad = Math.max(SIDE, half);
  const layout = layoutChart(kind, points, { width, height: PLOT_HEIGHT, left: SIDE, right: SIDE, top: pad, bottom: pad });
  const spec = GROWTH_SPECS[kind];
  const top = formatValue(kind, layout.yMax);
  const bottom = formatValue(kind, layout.yMin);
  const labelWidth = Math.ceil(Math.max(top.length, bottom.length) * CAPTION_SIZE * 0.62 * fontScale) + Spacing.two;

  const first = points[0];
  const last = points[points.length - 1];
  const spansYears = first.date.slice(0, 4) !== last.date.slice(0, 4);
  const firstLabel = formatDay(first.date, spansYears);
  const lastLabel = last.date === first.date ? null : formatDay(last.date, spansYears);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={chartAltText(kind, points)}
      style={styles.chart}>
      {/* The y axis: its unit, once, above the numbers. */}
      <ThemedText type="caption" themeColor="textSecondary" importantForAccessibility="no">
        {`${spec.label} (${spec.unit})`}
      </ThemedText>
      <View style={styles.row}>
        <View style={{ width: labelWidth, height: PLOT_HEIGHT }} importantForAccessibility="no-hide-descendants">
          <ThemedText
            type="caption"
            themeColor="textSecondary"
            numberOfLines={1}
            style={[styles.yLabel, { top: layout.yTop - half }]}>
            {top}
          </ThemedText>
          <ThemedText
            type="caption"
            themeColor="textSecondary"
            numberOfLines={1}
            style={[styles.yLabel, { top: layout.yBottom - half }]}>
            {bottom}
          </ThemedText>
        </View>
        <View
          style={styles.plot}
          importantForAccessibility="no-hide-descendants"
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          {width > 0 ? (
            <Svg width={width} height={PLOT_HEIGHT}>
              <Line
                x1={SIDE}
                y1={layout.yTop}
                x2={SIDE}
                y2={layout.yBottom}
                stroke={theme.border}
                strokeWidth={2}
                strokeLinecap="round"
              />
              <Line
                x1={SIDE}
                y1={layout.yBottom}
                x2={width - SIDE}
                y2={layout.yBottom}
                stroke={theme.border}
                strokeWidth={2}
                strokeLinecap="round"
              />
              {layout.path ? (
                <Path
                  d={layout.path}
                  fill="none"
                  stroke={theme.accent}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              {layout.dots.map((dot, index) => (
                <Circle
                  key={dot.id}
                  cx={dot.x}
                  cy={dot.y}
                  // The latest measurement is the larger dot.
                  r={index === layout.dots.length - 1 ? 7 : 5}
                  fill={theme.accent}
                  stroke={theme.card}
                  strokeWidth={2}
                />
              ))}
            </Svg>
          ) : null}
        </View>
      </View>
      <View
        style={[styles.xLabels, { paddingLeft: labelWidth, justifyContent: lastLabel ? 'space-between' : 'center' }]}
        importantForAccessibility="no-hide-descendants">
        <ThemedText type="caption" themeColor="textSecondary">
          {firstLabel}
        </ThemedText>
        {lastLabel ? (
          <ThemedText type="caption" themeColor="textSecondary">
            {lastLabel}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { gap: Spacing.one },
  row: { flexDirection: 'row' },
  plot: { flex: 1, height: PLOT_HEIGHT },
  yLabel: { position: 'absolute', right: Spacing.one, left: 0, textAlign: 'right' },
  xLabels: { flexDirection: 'row', gap: Spacing.two },
});
