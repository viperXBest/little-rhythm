import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Hero } from '@/components/account-ui';
import { Card } from '@/components/card';
import { Button, ErrorText, Field, Screen } from '@/components/form';
import { font, Spacing } from '@/constants/theme';
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
      <Hero
        title="Join your partner"
        lead="On their phone: Home → Invite your partner. The code works once and expires after 24 hours."
      />
      <Card style={styles.form}>
        <Field
          label="Pairing code"
          value={code}
          onChangeText={setCode}
          placeholder="ABCD-EFGH"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={9}
          style={[styles.code, font('heading', 700)]}
          onSubmitEditing={onSubmit}
        />
        <ErrorText>{error}</ErrorText>
        <Button title="Join" onPress={onSubmit} busy={busy} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  // The code alphabet has no 0/O or 1/I, so Baloo reads unambiguously here.
  code: { fontSize: 30, lineHeight: 40, letterSpacing: 4, textAlign: 'center' },
});
