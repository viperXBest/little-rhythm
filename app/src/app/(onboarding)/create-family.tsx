import { useState } from 'react';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { parseBirthDate } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function CreateFamily() {
  const { refreshFamily } = useSession();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    const babyName = name.trim();
    if (babyName.length < 1 || babyName.length > 50) {
      setError('Enter your baby’s name (up to 50 characters).');
      return;
    }
    const date = parseBirthDate(birthDate);
    if (!date) {
      setError('Enter the birth date as YYYY-MM-DD, within the last 3 years.');
      return;
    }
    setBusy(true);
    const { error: rpcError } = await supabase.rpc('create_family', {
      p_baby_name: babyName,
      p_baby_birth_date: date,
    });
    if (rpcError && rpcError.message !== 'already_in_family') {
      setBusy(false);
      setError(
        rpcError.message === 'invalid_birth_date'
          ? 'Enter the birth date as YYYY-MM-DD, within the last 3 years.'
          : 'Could not save. Check your connection and try again.',
      );
      return;
    }
    // The family now exists; refreshing routes to the home screen.
    await refreshFamily();
    setBusy(false);
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Your baby</ThemedText>
      <ThemedText themeColor="textSecondary">
        Only the first name and birth date. The birth date sets the age used for the rhythm.
      </ThemedText>
      <Field label="First name" value={name} onChangeText={setName} maxLength={50} />
      <Field
        label="Birth date"
        value={birthDate}
        onChangeText={setBirthDate}
        placeholder="YYYY-MM-DD"
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        onSubmitEditing={onSubmit}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Continue" onPress={onSubmit} busy={busy} />
    </Screen>
  );
}
