import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouch, Radius, Spacing, Sticker } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type DateFieldProps = {
  label: string;
  value: Date | null;
  /** 'datetime' opens the date dialog, then the time dialog. */
  mode: 'date' | 'datetime';
  onChange: (value: Date) => void;
  placeholder?: string;
  /** The link text while there is no value (default "Set ›"); a field that reads "Now" says "Change ›". */
  emptyAction?: string;
  /** Where the picker opens while there is no value (default: the latest allowed date, else now). */
  initialValue?: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  /** What the field sits on: on a card the field takes the page colour (with an outline). */
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
  emptyAction = 'Set ›',
  initialValue,
  minimumDate,
  maximumDate,
  on = 'page',
}: DateFieldProps) {
  const theme = useTheme();

  function open() {
    const initial = value ?? initialValue ?? maximumDate ?? new Date();
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

  // The label sits inside the field (C mockup), above the value, with "Change ›" on the right.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ? format(value, mode) : placeholder}`}
      accessibilityHint={mode === 'date' ? 'Opens the date picker' : 'Opens the date and time picker'}
      onPress={open}
      style={({ pressed }) => [
        styles.input,
        {
          backgroundColor: pressed ? theme.border : on === 'card' ? theme.background : theme.surface,
          borderColor: theme.border,
        },
      ]}>
      <View style={styles.text}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText themeColor={value ? 'text' : 'textSecondary'}>{value ? format(value, mode) : placeholder}</ThemedText>
      </View>
      <ThemedText type="link" themeColor="link">
        {value ? 'Change ›' : emptyAction}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: MinTouch + Spacing.two,
    borderRadius: Radius.field,
    borderWidth: Sticker.outline,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.one,
  },
  text: { flex: 1 },
});
