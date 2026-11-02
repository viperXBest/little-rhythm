import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
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

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <ThemedText type="small" style={styles.label}>
          Remind me before feeds, naps and the bedtime routine, and about the check-in at 21:00
        </ThemedText>
        <Switch
          value={enabled === true}
          disabled={enabled === null || busy}
          onValueChange={(next) => void onChange(next)}
          // Off: a textSecondary track (≥ 6.7:1 on the card) so the control reads in dark mode too.
          trackColor={{ false: theme.textSecondary, true: theme.primary }}
          thumbColor={enabled === true ? theme.onPrimary : theme.card}
          accessibilityLabel="Reminders"
        />
      </View>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  label: { flex: 1 },
});
