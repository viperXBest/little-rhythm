import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { DateField } from '@/components/date-field';
import { Button, ErrorText, Field } from '@/components/form';
import { Icon } from '@/components/illustrations';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { toLocalDateString } from '@/lib/dates';
import {
  formatValue,
  GROWTH_SPECS,
  parseValue,
  validateMeasuredOn,
  type GrowthKind,
} from '@/lib/growth-values';

export type GrowthFormValues = { value: number; measuredOn: string };

type Props = {
  kind: GrowthKind;
  /** The baby's birth date, YYYY-MM-DD: no measurement can be older. */
  birthDate: string;
  /** The measurement as it was when the form opened (a snapshot); null adds a new one. */
  initial: GrowthFormValues | null;
  /** Saves; resolves to an error message, or null when it worked (the screen then closes the form). */
  onSave: (values: GrowthFormValues) => Promise<string | null>;
  /** Present when editing. Resolves like onSave. */
  onDelete?: () => Promise<string | null>;
  onCancel: () => void;
};

/** A local-calendar Date at midnight for a YYYY-MM-DD string. */
function dateOf(day: string): Date {
  const [year, month, dom] = day.split('-').map(Number);
  return new Date(year, month - 1, dom);
}

/** Add or edit one measurement: the number in kg or cm and the day it was taken. */
export function GrowthForm({ kind, birthDate, initial, onSave, onDelete, onCancel }: Props) {
  const spec = GROWTH_SPECS[kind];
  // The stored value is shown exactly (grams, millimetres), so typing it back gives the same number.
  const [text, setText] = useState(initial ? formatValue(kind, initial.value) : '');
  const [date, setDate] = useState(initial ? dateOf(initial.measuredOn) : new Date());
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSavePress() {
    setError(null);
    setFieldError(null);
    const parsed = parseValue(kind, text);
    if (!parsed.ok) {
      setFieldError(parsed.message);
      return;
    }
    const value = parsed.value;
    const measuredOn = toLocalDateString(date);
    const invalid = validateMeasuredOn(measuredOn, birthDate, toLocalDateString(new Date()));
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    const failure = await onSave({ value, measuredOn });
    setBusy(false);
    if (failure) setError(failure);
  }

  function onDeletePress() {
    if (!onDelete) return;
    Alert.alert('Delete this measurement?', 'It disappears for both of you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            setBusy(true);
            const failure = await onDelete();
            setBusy(false);
            if (failure) setError(failure);
          })(),
      },
    ]);
  }

  return (
    <>
      <ThemedText type="title" accessibilityRole="header">
        {initial ? `Edit ${spec.noun}` : `Add ${spec.noun}`}
      </ThemedText>
      <Card style={styles.card}>
        <Field
          label={`${spec.label} (${spec.unit})`}
          value={text}
          onChangeText={setText}
          keyboardType="decimal-pad"
          // A Romanian keyboard types a comma; parseValue takes both.
          autoFocus={!initial}
          maxLength={8}
          error={fieldError}
        />
        <DateField
          label="Date"
          mode="date"
          value={date}
          onChange={setDate}
          minimumDate={dateOf(birthDate)}
          maximumDate={new Date()}
          on="card"
        />
      </Card>
      <ErrorText>{error}</ErrorText>
      <Button title="Save" onPress={() => void onSavePress()} busy={busy} />
      <Button title="Cancel" variant="quiet" onPress={onCancel} disabled={busy} />
      {initial && onDelete ? (
        // Delete sits apart from Save, so the two fills never read as a pair.
        <View style={styles.danger}>
          <Button
            title="Delete"
            variant="danger"
            onPress={onDeletePress}
            disabled={busy}
            icon={<Icon name="delete" size={22} color="onPrimary" fill="error" />}
          />
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  danger: { marginTop: Spacing.four },
});
