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
        onPress={open}
        style={({ pressed }) => [
          styles.input,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.dimmed,
        ]}>
        <ThemedText themeColor={value ? 'text' : 'textSecondary'}>
          {value ? format(value, mode) : placeholder}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  input: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  dimmed: { opacity: 0.6 },
});
