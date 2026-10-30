import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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
  const theme = useTheme();
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  return (
    <View style={styles.row}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View style={styles.stepper}>
        <StepButton label={`Less ${unit}`} text="−" onPress={() => set(value - step)} disabled={value <= min} />
        <ThemedText style={[styles.value, { color: theme.text }]} accessibilityLiveRegion="polite">
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
        { backgroundColor: theme.border },
        (pressed || disabled) && styles.dimmed,
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
};

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={[styles.segmented, { backgroundColor: theme.surface }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.one },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  stepButton: { width: 56, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepText: { lineHeight: 36 },
  value: { fontSize: 22, lineHeight: 30, fontWeight: 600 },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: Spacing.half },
  segment: { flex: 1, borderRadius: 10, paddingVertical: Spacing.two, alignItems: 'center' },
  dimmed: { opacity: 0.5 },
});
