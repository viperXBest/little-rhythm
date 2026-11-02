import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouch, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Prediction } from '@/lib/predict';
import { disableReminders, enableReminders, remindersEnabled, syncCheckin, syncReminders } from '@/lib/reminders';

/**
 * One toggle per phone: reminders 10 min before feed and nap windows, at routine
 * start, and for the daily check-in at 21:00.
 */
export function ReminderToggle({ prediction }: { prediction: Prediction | null }) {
  const theme = useTheme();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void remindersEnabled()
      .catch(() => false)
      .then((value) => {
        if (!cancelled) setEnabled(value);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onChange(next: boolean) {
    setBusy(true);
    setNote(null);
    try {
      if (next) {
        if ((await enableReminders()) === 'denied') {
          setNote('Notifications are off for Little Rhythm. Turn them on in Android settings.');
          return;
        }
        setEnabled(true);
        if (prediction) await syncReminders(prediction);
        await syncCheckin();
      } else {
        await disableReminders();
        setEnabled(false);
      }
    } catch {
      setNote('Couldn’t change reminders. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const disabled = enabled === null || busy;
  const text = 'Remind me before feeds, naps and the bedtime routine, and about the check-in at 21:00';

  // The whole row is the switch (≥ 48 dp), so the label is a target too. TalkBack focuses the row only.
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel="Reminders"
        accessibilityHint={text}
        accessibilityState={{ checked: enabled === true, disabled, busy }}
        disabled={disabled}
        onPress={() => void onChange(enabled !== true)}
        style={styles.row}>
        <ThemedText type="small" style={styles.label} importantForAccessibility="no">
          {text}
        </ThemedText>
        <Switch
          value={enabled === true}
          disabled={disabled}
          onValueChange={(next) => void onChange(next)}
          // Off: a textSecondary thumb (≥ 6.7:1 on the card) so the off state reads in dark mode too.
          trackColor={{ false: theme.border, true: theme.primary }}
          thumbColor={enabled === true ? theme.onPrimary : theme.textSecondary}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        />
      </Pressable>
      {note ? (
        <ThemedText type="small" themeColor="textSecondary">
          {note}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, minHeight: MinTouch },
  label: { flex: 1 },
});
