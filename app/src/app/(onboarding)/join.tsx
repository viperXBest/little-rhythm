import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Fonts } from '@/constants/theme';
import { pairErrorMessage, redeemPairCode } from '@/lib/pair';
import { useSession } from '@/lib/session';

export default function Join() {
  const { refreshFamily } = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (code.replace(/[\s-]/g, '').length !== 8) {
      setError('The code has 8 characters, like ABCD-EFGH.');
      return;
    }
    setBusy(true);
    const result = await redeemPairCode(code);
    if (!result.ok) {
      setBusy(false);
      setError(pairErrorMessage[result.error]);
      return;
    }
    await refreshFamily();
    setBusy(false);
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Join your partner</ThemedText>
      <ThemedText themeColor="textSecondary">
        On their phone: Home → Invite your partner. The code works once and expires after 24 hours.
      </ThemedText>
      <Field
        label="Pairing code"
        value={code}
        onChangeText={setCode}
        placeholder="ABCD-EFGH"
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        maxLength={9}
        style={styles.code}
        onSubmitEditing={onSubmit}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Join" onPress={onSubmit} busy={busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  code: { fontFamily: Fonts.mono, fontSize: 24, letterSpacing: 4, textAlign: 'center' },
});
