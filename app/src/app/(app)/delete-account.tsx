import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { Button, ErrorText, Field, Screen } from '@/components/form';
import { Loading } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { deleteAccount, deleteAccountErrorMessage } from '@/lib/account';
import { useSession } from '@/lib/session';

export default function DeleteAccount() {
  const { family } = useSession();
  const [password, setPassword] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!family) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
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

  // Serious and calm: no mascot, no shelf on the explanation, flat danger buttons.
  return (
    <Screen>
      <View style={styles.page}>
        <ThemedText type="title" accessibilityRole="header">
          Delete account
        </ThemedText>
        <Card raised={false} style={styles.card}>
          <ThemedText type="defaultBold">This can&apos;t be undone.</ThemedText>
          {withPartner ? (
            <ThemedText>
              Your account, your private chat, your check-ins and your messages in the shared chat are
              deleted. Your partner keeps {family.baby.name}&apos;s log; the events you logged stay
              without your name.
            </ThemedText>
          ) : (
            <ThemedText>
              You are the only parent here, so {family.baby.name}&apos;s whole log goes too: every feed,
              sleep and diaper, the chats, the check-ins and any pending invite.
            </ThemedText>
          )}
        </Card>
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
        {busy ? <Loading label="Deleting your account…" /> : null}
        {confirming ? (
          <>
            <ThemedText type="defaultBold" accessibilityRole="header">
              Delete your account now?
            </ThemedText>
            <Button title="Yes, delete everything" variant="danger" onPress={() => void onDelete()} busy={busy} />
            <Button title="Keep my account" variant="secondary" onPress={() => setConfirming(false)} disabled={busy} />
          </>
        ) : (
          <>
            <Button title="Delete my account" variant="danger" onPress={onContinue} />
            <Button title="Back" variant="quiet" onPress={() => router.back()} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Fills the screen so the content sits at the top, not centred.
  page: { flexGrow: 1, gap: Spacing.three },
  card: { gap: Spacing.two },
});
