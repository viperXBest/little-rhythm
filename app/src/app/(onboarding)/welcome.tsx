import { router } from 'expo-router';

import { Button, Screen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

export default function Welcome() {
  return (
    <Screen>
      <ThemedText type="subtitle">Welcome</ThemedText>
      <ThemedText themeColor="textSecondary">
        One of you sets up the baby. The other joins with the code it shows.
      </ThemedText>
      <Button title="Set up our baby" onPress={() => router.push('/create-family')} />
      <Button
        title="I have a code from my partner"
        variant="secondary"
        onPress={() => router.push('/join')}
      />
      <Button title="Sign out" variant="secondary" onPress={() => void supabase.auth.signOut()} />
    </Screen>
  );
}
