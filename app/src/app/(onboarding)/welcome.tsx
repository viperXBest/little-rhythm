import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Hero } from '@/components/account-ui';
import { Button, Screen } from '@/components/form';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function Welcome() {
  return (
    <Screen>
      <Hero
        big
        title="Welcome"
        lead="One of you sets up the baby. The other joins with the code it shows."
      />
      <View style={styles.choices}>
        <Button title="Set up our baby" size="large" onPress={() => router.push('/create-family')} />
        <Button
          title="I have a code from my partner"
          variant="secondary"
          size="large"
          onPress={() => router.push('/join')}
        />
      </View>
      {/* Quiet, so leaving doesn't weigh the same as the two ways in. */}
      <Button title="Sign out" variant="quiet" onPress={() => void supabase.auth.signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: { gap: Spacing.three },
});
