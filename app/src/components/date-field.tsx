import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type DateFieldProps = {
  label: string;
  value: Date | null;
  /** 'datetime' opens the date dialog, then the time dialog. */
  mode: 'date' | 'datetime';
  onChange: (value: Date) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** What the field sits on: a card is already `surface`, so the field takes the page colour. */
  on?: 'page' | 'card';
};

function format(value: Date, mode: DateFieldProps['mode']): string {
  return mode === 'date'
    ? value.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
    : value.toLocaleString([], {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
}

export function DateField({
  label,
  value,
  mode,
  onChange,
  placeholder = 'Choose',
  minimumDate,
  maximumDate,
  on = 'page',
}: DateFieldProps) {
  const theme = useTheme();

  function open() {
    const initial = value ?? maximumDate ?? new Date();
    DateTimePickerAndroid.open({
      value: initial,
      mode: 'date',
      minimumDate,
      maximumDate,
      onChange: (event, date) => {
        if (event.type !== 'set' || !date) return;
        if (mode === 'date') {
          onChange(date);
          return;
        }
        DateTimePickerAndroid.open({
          value: date,
          mode: 'time',
          is24Hour: true,
          onChange: (timeEvent, time) => {
            if (timeEvent.type === 'set' && time) onChange(time);
          },
        });
      },
    });
  }

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? format(value, mode) : placeholder}`}
        accessibilityHint={mode === 'date' ? 'Opens the date picker' : 'Opens the date and time picker'}
        onPress={open}
        style={({ pressed }) => [
          styles.input,
          { backgroundColor: on === 'card' ? theme.background : theme.surface, borderColor: theme.border },
          pressed && styles.dimmed,
        ]}>
        <ThemedText style={styles.value} themeColor={value ? 'text' : 'textSecondary'}>
          {value ? format(value, mode) : placeholder}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="link">
          {value ? 'Change ›' : 'Set ›'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  value: { flex: 1 },
  dimmed: { opacity: 0.6 },
});
