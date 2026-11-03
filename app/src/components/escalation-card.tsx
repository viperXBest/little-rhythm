import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { emergencyNumber, type EmergencyNumber } from '@/lib/emergency-number';
import { timeZoneName } from '@/lib/time-zone';

// Shown instead of any model text when a turn is about health. The wording is
// fixed here in the app and never comes from the model: Little Rhythm gives no
// medical advice. Only the emergency number varies, from a fixed set (112, 911 or
// 999, by the phone's time zone; lib/emergency-number.ts).
function text(number: EmergencyNumber) {
  return {
    health: {
      title: 'I can’t help with health questions',
      body: `Please contact your paediatrician or doctor. In an emergency, call ${number}.`,
    },
    urgent: {
      title: 'This may be an emergency',
      body: `Call ${number} now.`,
    },
  } as const;
}

export function EscalationCard({ urgent }: { urgent: boolean }) {
  const theme = useTheme();
  const number = emergencyNumber(timeZoneName());
  const copy = text(number)[urgent ? 'urgent' : 'health'];
  // A warning look no other card uses: tinted fill, red border and a ⚠ mark.
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.card,
        {
          backgroundColor: theme.warningBackground,
          borderColor: theme.error,
          borderWidth: urgent ? 3 : 2,
        },
      ]}>
      <View style={styles.title}>
        <ThemedText type="defaultBold" accessibilityElementsHidden importantForAccessibility="no" style={{ color: theme.errorText }}>
          ⚠
        </ThemedText>
        <ThemedText type="defaultBold" style={[styles.titleText, { color: urgent ? theme.errorText : theme.text }]}>
          {copy.title}
        </ThemedText>
      </View>
      <ThemedText type="default">{copy.body}</ThemedText>
      {urgent ? (
        <Button title={`Call ${number}`} variant="danger" onPress={() => void Linking.openURL(`tel:${number}`)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.field, padding: Spacing.three, gap: Spacing.two },
  title: { flexDirection: 'row', gap: Spacing.two },
  titleText: { flex: 1 },
});
