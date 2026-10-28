import { Link, router } from 'expo-router';
import { useState } from 'react';

import { Button, ErrorText, Field, Screen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

const MIN_PASSWORD = 8;

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSubmit() {
    setError(null);
    const displayName = name.trim();
    if (displayName.length < 1 || displayName.length > 50) {
      setError('Enter your first name (up to 50 characters).');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Use at least ${MIN_PASSWORD} characters for your password.`);
      return;
    }
    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: displayName } },
    });
    setBusy(false);
    if (signUpError) {
      setError(
        signUpError.code === 'weak_password'
          ? 'That password is too weak. Try a longer one.'
          : signUpError.code === 'over_email_send_rate_limit'
            ? 'Too many sign-ups right now. Try again in a few minutes.'
            : 'Could not create your account. Try again.',
      );
      return;
    }
    // With email confirmation on, sign-up returns no session until the link is clicked.
    if (!data.session) setCheckEmail(true);
  }

  if (checkEmail) {
    return (
      <Screen>
        <ThemedText type="subtitle">Check your email</ThemedText>
        <ThemedText themeColor="textSecondary">
          We sent a confirmation link to {email.trim()}. Open it on this phone, then sign in.
        </ThemedText>
        <Button title="Go to sign in" onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Create your account</ThemedText>
      <ThemedText themeColor="textSecondary">
        Your partner creates their own account and joins with a code.
      </ThemedText>
      <Field
        label="Your first name"
        value={name}
        onChangeText={setName}
        autoComplete="given-name"
        textContentType="givenName"
        maxLength={50}
      />
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
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={onSubmit}
      />
      <ErrorText>{error}</ErrorText>
      <Button title="Create account" onPress={onSubmit} busy={busy} />
      <Link href="/sign-in" replace>
        <ThemedText type="linkPrimary">Already have an account? Sign in</ThemedText>
      </Link>
    </Screen>
  );
}
