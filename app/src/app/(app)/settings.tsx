import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Screen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

/** Account actions, one tap away from home so they never sit next to the daily buttons. */
export default function Settings() {
  const theme = useTheme();
  return (
    <Screen>
      <ThemedText type="title" accessibilityRole="header">
        Settings
      </ThemedText>
      <Button title="Sign out" variant="secondary" onPress={() => void supabase.auth.signOut()} />
      {/* A divider and extra room keep the destructive action apart from Sign out. */}
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <Button title="Delete account" variant="danger" onPress={() => router.push('/delete-account')} />
      <View style={styles.spacer} />
      <Button title="Back" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  divider: { height: 2, marginVertical: Spacing.three },
  spacer: { height: Spacing.three },
});
