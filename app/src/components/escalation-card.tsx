import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Shown instead of any model text when a turn is about health. The wording is
// fixed here in the app and never comes from the model: Little Rhythm gives no
// medical advice.
const TEXT = {
  health: {
    title: 'I can’t help with health questions',
    body: 'Please contact your paediatrician or doctor. In an emergency, call 112.',
  },
  urgent: {
    title: 'This may be an emergency',
    body: 'Call 112 now.',
  },
} as const;

export function EscalationCard({ urgent }: { urgent: boolean }) {
  const theme = useTheme();
  const text = urgent ? TEXT.urgent : TEXT.health;
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
        <ThemedText type="smallBold" accessibilityElementsHidden importantForAccessibility="no" style={{ color: theme.errorText }}>
          ⚠
        </ThemedText>
        <ThemedText type="smallBold" style={[styles.titleText, { color: urgent ? theme.errorText : theme.text }]}>
          {text.title}
        </ThemedText>
      </View>
      <ThemedText type="small">{text.body}</ThemedText>
      {urgent ? <Button title="Call 112" variant="danger" onPress={() => void Linking.openURL('tel:112')} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  title: { flexDirection: 'row', gap: Spacing.two },
  titleText: { flex: 1 },
});
