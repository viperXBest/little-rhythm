import { Link } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (!signInError) return; // The session change routes onward.
    if (signInError.code === 'email_not_confirmed') {
      setError('Confirm your email first. Check your inbox for the link.');
    } else if (signInError.code === 'invalid_credentials') {
      setError('Email or password is incorrect.');
    } else {
      setError('Could not sign in. Check your connection and try again.');
    }
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Little Rhythm</ThemedText>
      <ThemedText themeColor="textSecondary">Sign in to see your baby’s day.</ThemedText>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={onSubmit}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Sign in" onPress={onSubmit} busy={busy} />
      <Link href="/sign-up" replace>
        <ThemedText type="linkPrimary">New here? Create an account</ThemedText>
      </Link>
    </Screen>
  );
}
