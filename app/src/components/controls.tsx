import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouch, Radius, Spacing, Sticker, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type StepperProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  unit: string;
};

export function Stepper({ label, value, onChange, step, min, max, unit }: StepperProps) {
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <View style={styles.row}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.stepper}>
        <StepButton label={`Less ${unit}`} text="−" onPress={() => set(value - step)} disabled={value <= min} />
        <ThemedText type="time" style={styles.value} accessibilityLiveRegion="polite">
          {value} {unit}
        </ThemedText>
        <StepButton label={`More ${unit}`} text="+" onPress={() => set(value + step)} disabled={value >= max} />
      </View>
    </View>
  );
}

function StepButton({
  label,
  text,
  onPress,
  disabled,
}: {
  label: string;
  text: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        { backgroundColor: pressed ? theme.border : theme.surface, borderColor: theme.border },
        disabled && styles.dimmed,
      ]}>
      <ThemedText type="subtitle" style={styles.stepText}>
        {text}
      </ThemedText>
    </Pressable>
  );
}

type SegmentedProps<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Spoken name of the group (e.g. "Thread"). */
  accessibilityLabel?: string;
};

/** A segment track (surface) with the selected option in the full primary fill. */
export function Segmented<T extends string>({ options, value, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.segmented, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected
                ? { backgroundColor: theme.primary }
                : pressed && { backgroundColor: theme.border },
            ]}>
            <ThemedText
              type="smallBold"
              style={[styles.segmentLabel, { color: selected ? theme.onPrimary : theme.text }]}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export type ChipTone = 'neutral' | 'feed' | 'sleep' | 'diaper' | 'info';

const CHIP_FILL: Record<ChipTone, ThemeColor> = {
  neutral: 'surface',
  feed: 'feedSoft',
  sleep: 'sleepSoft',
  diaper: 'diaperSoft',
  info: 'infoBackground',
};

type ChipProps = {
  label: string;
  /** Event tint for the fill (text stays `text`). */
  tone?: ChipTone;
  /** Selected chips take the full primary fill. */
  selected?: boolean;
  /** Without onPress the chip is a static label (a pill), not a control. */
  onPress?: () => void;
  disabled?: boolean;
  /** Decorative icon before the label. */
  icon?: ReactNode;
  accessibilityLabel?: string;
};

/** A rounded chip: a tappable choice (48 dp) or, without onPress, a static pill. */
export function Chip({
  label,
  tone = 'neutral',
  selected = false,
  onPress,
  disabled = false,
  icon,
  accessibilityLabel,
}: ChipProps) {
  const theme = useTheme();
  const fill = selected ? theme.primary : theme[CHIP_FILL[tone]];
  const color = selected ? theme.onPrimary : theme.text;
  const body = (
    <>
      {icon ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {icon}
        </View>
      ) : null}
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </>
  );
  if (!onPress) {
    return (
      <View
        accessibilityLabel={accessibilityLabel}
        style={[styles.chip, styles.pill, { backgroundColor: fill, borderColor: theme.border }]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        styles.tappable,
        {
          backgroundColor: pressed && !selected ? theme.border : fill,
          borderColor: selected ? theme.primary : theme.border,
        },
        disabled && styles.dimmed,
      ]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.one },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  stepButton: {
    minWidth: 56,
    minHeight: MinTouch,
    borderRadius: Radius.field,
    borderWidth: Sticker.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { lineHeight: 34 },
  value: { flexShrink: 1, textAlign: 'center' },
  segmented: {
    flexDirection: 'row',
    borderRadius: Radius.field,
    borderWidth: Sticker.outline,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    borderRadius: Radius.small,
    minHeight: MinTouch,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentLabel: { textAlign: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + Spacing.half,
    borderRadius: Radius.pill,
    borderWidth: Sticker.outline,
    paddingHorizontal: Spacing.three,
  },
  pill: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  tappable: { minHeight: MinTouch, paddingVertical: Spacing.two },
  dimmed: { opacity: 0.5 },
});
