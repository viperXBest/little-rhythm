import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Hero } from '@/components/account-ui';
import { Card } from '@/components/card';
import { DateField } from '@/components/date-field';
import { Button, ErrorText, Field, Screen } from '@/components/form';
import { Spacing } from '@/constants/theme';
import { parseBirthDate, toLocalDateString } from '@/lib/dates';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function CreateFamily() {
  const { refreshFamily } = useSession();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date();
  const threeYearsAgo = new Date(today.getFullYear() - 3, today.getMonth(), today.getDate());

  async function onSubmit() {
    setError(null);
    const babyName = name.trim();
    if (babyName.length < 1 || babyName.length > 50) {
      setError('Enter your baby’s name (up to 50 characters).');
      return;
    }
    const date = birthDate ? parseBirthDate(toLocalDateString(birthDate)) : null;
    if (!date) {
      setError('Choose a birth date within the last 3 years.');
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
          ? 'Choose a birth date within the last 3 years.'
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
      <Hero
        title="Your baby"
        lead="Only the first name and birth date. The birth date sets the age used for the rhythm."
      />
      <Card style={styles.form}>
        <Field label="First name" value={name} onChangeText={setName} maxLength={50} />
        <DateField
          label="Birth date"
          mode="date"
          value={birthDate}
          onChange={setBirthDate}
          minimumDate={threeYearsAgo}
          maximumDate={today}
        />
        <ErrorText>{error}</ErrorText>
        <Button title="Continue" onPress={onSubmit} busy={busy} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
});
