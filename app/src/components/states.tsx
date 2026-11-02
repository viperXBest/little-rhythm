import { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Shared loading, empty and error states, so every screen says the same thing
// the same way. Messages are fixed text from the app, never an error code.
// `illustration` takes a decorative node (an illustrations/ component); it is hidden
// from screen readers. Never pass the mascot to ErrorState (no mascot near errors).

function Art({ children }: { children: ReactNode }) {
  return (
    <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {children}
    </View>
  );
}

export function Loading({ label = 'Loading…', illustration }: { label?: string; illustration?: ReactNode }) {
  const theme = useTheme();
  const row = (
    <View style={styles.row}>
      <ActivityIndicator color={theme.focus} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {label}
      </ThemedText>
    </View>
  );
  if (!illustration) {
    return (
      <View accessibilityLiveRegion="polite">
        {row}
      </View>
    );
  }
  return (
    <View style={styles.block} accessibilityLiveRegion="polite">
      <Art>{illustration}</Art>
      {row}
    </View>
  );
}

export function Empty({
  children,
  title,
  illustration,
  action,
}: {
  children: string;
  /** Optional heading above the message. */
  title?: string;
  illustration?: ReactNode;
  /** Optional call to action (e.g. a Button). */
  action?: ReactNode;
}) {
  const message = (
    <ThemedText type="small" themeColor="textSecondary">
      {children}
    </ThemedText>
  );
  if (!title && !illustration && !action) return message;
  return (
    <View style={styles.block}>
      {illustration ? <Art>{illustration}</Art> : null}
      {title ? (
        <ThemedText type="cardTitle" accessibilityRole="header">
          {title}
        </ThemedText>
      ) : null}
      {message}
      {action}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
  illustration,
}: {
  message: string;
  onRetry?: () => void;
  illustration?: ReactNode;
}) {
  return (
    <View style={styles.block} accessibilityLiveRegion="polite">
      {illustration ? <Art>{illustration}</Art> : null}
      <ThemedText type="small" themeColor="textSecondary">
        {message}
      </ThemedText>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flexShrink: 1 },
  block: { gap: Spacing.two },
  art: { alignItems: 'center', paddingVertical: Spacing.two },
});
