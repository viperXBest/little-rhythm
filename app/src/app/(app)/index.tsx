import { router } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { CheckinCard } from '@/components/checkin-card';
import { Button, ErrorText, Screen } from '@/components/form';
import { NextUp } from '@/components/next-up';
import { QuickLog } from '@/components/quick-log';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Timeline } from '@/components/timeline';
import { Fonts, Spacing } from '@/constants/theme';
import { ageInWeeks } from '@/lib/dates';
import { createPairCode, pairErrorMessage } from '@/lib/pair';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Invite = { code: string; expiresAt: Date };

export default function Home() {
  const { family } = useSession();
  if (!family) return null;

  const weeks = ageInWeeks(family.baby.birthDate);

  return (
    <Screen>
      <ThemedText type="subtitle">{family.baby.name}</ThemedText>
      <ThemedText themeColor="textSecondary">
        {weeks === 1 ? '1 week old' : `${weeks} weeks old`}
      </ThemedText>
      {family.memberCount < 2 ? (
        <InviteCard />
      ) : (
        <ThemedText themeColor="textSecondary">You and your partner are both here.</ThemedText>
      )}
      <NextUp />
      <QuickLog />
      <CheckinCard />
      <Button title="Chat" variant="secondary" onPress={() => router.push('/chat')} />
      <Timeline />
      <Button title="Sign out" variant="secondary" onPress={() => void supabase.auth.signOut()} />
    </Screen>
  );
}

function InviteCard() {
  const { refreshFamily } = useSession();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    setBusy(true);
    const result = await createPairCode();
    setBusy(false);
    if (!result.ok) {
      setError(pairErrorMessage[result.error]);
      if (result.error === 'family_full') void refreshFamily();
      return;
    }
    setInvite({ code: result.data.code, expiresAt: new Date(result.data.expires_at) });
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Invite your partner</ThemedText>
      {invite ? (
        <View style={styles.inviteBody}>
          <ThemedText selectable style={styles.code}>
            {invite.code}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            They sign up, tap “I have a code”, and enter it. Works once, until{' '}
            {invite.expiresAt.toLocaleString([], {
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </ThemedText>
          <Button
            title="Share code"
            onPress={() =>
              void Share.share({ message: `Join me on Little Rhythm with this code: ${invite.code}` })
            }
          />
          <Button title="New code" variant="secondary" onPress={onCreate} busy={busy} />
        </View>
      ) : (
        <Button title="Show pairing code" onPress={onCreate} busy={busy} />
      )}
      <ErrorText>{error}</ErrorText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  inviteBody: { gap: Spacing.two },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 32,
    lineHeight: 44,
    letterSpacing: 4,
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
});
