import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { deleteAccount, deleteAccountErrorMessage } from '@/lib/account';
import { useSession } from '@/lib/session';

export default function DeleteAccount() {
  const { family } = useSession();
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!family) return null;
  const withPartner = family.memberCount >= 2;

  function onContinue() {
    setError(null);
    if (!password) {
      setError('Enter your password to continue.');
      return;
    }
    setConfirming(true);
  }

  async function onDelete() {
    setError(null);
    setBusy(true);
    const result = await deleteAccount(password);
    // On success the session ends and the app returns to sign-in.
    if (result.ok) return;
    setBusy(false);
    setConfirming(false);
    setError(deleteAccountErrorMessage[result.error]);
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Delete account</ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">This can&apos;t be undone.</ThemedText>
        {withPartner ? (
          <ThemedText type="small">
            Your account, your private chat, your check-ins and your messages in the shared chat are
            deleted. Your partner keeps {family.baby.name}&apos;s log; the events you logged stay
            without your name.
          </ThemedText>
        ) : (
          <ThemedText type="small">
            You are the only parent here, so {family.baby.name}&apos;s whole log goes too: every feed,
            sleep and diaper, the chats, the check-ins and any pending invite.
          </ThemedText>
        )}
      </ThemedView>
      <Field
        label="Password"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setConfirming(false);
        }}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        maxLength={200}
        editable={!busy}
        onSubmitEditing={onContinue}
      />
      <ErrorText>{error}</ErrorText>
      {confirming ? (
        <>
          <ThemedText type="smallBold">Delete your account now?</ThemedText>
          <Button title="Yes, delete everything" onPress={() => void onDelete()} busy={busy} />
          <Button title="Keep my account" variant="secondary" onPress={() => setConfirming(false)} disabled={busy} />
        </>
      ) : (
        <>
          <Button title="Delete my account" onPress={onContinue} />
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
});
