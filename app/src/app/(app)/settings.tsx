import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/account-ui';
import { Card } from '@/components/card';
import { Button, Screen } from '@/components/form';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/** Account actions, one tap away from home so they never sit next to the daily buttons. */
export default function Settings() {
  return (
    <Screen>
      {/* Fills the screen so the content sits at the top, not centred. */}
      <View style={styles.page}>
        <BackHeader title="Settings" />
        <Card>
          <Button title="Sign out" variant="secondary" onPress={() => void supabase.auth.signOut()} />
        </Card>
        {/* A separate card and extra room keep the destructive action apart from Sign out. */}
        <View style={styles.spacer} />
        <Card>
          <Button title="Delete account" variant="danger" onPress={() => router.push('/delete-account')} />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, gap: Spacing.three },
  spacer: { height: Spacing.three },
});
