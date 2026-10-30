import { router } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { CheckinCard } from '@/components/checkin-card';
import { Button, ErrorText, Screen } from '@/components/form';
import { NextUp } from '@/components/next-up';
import { NightFeedsCard } from '@/components/night-feeds-card';
import { QuickLog } from '@/components/quick-log';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Timeline } from '@/components/timeline';
import { Fonts, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { ageInWeeks } from '@/lib/dates';
import { createPairCode, pairErrorMessage } from '@/lib/pair';
import type { NightFeeds } from '@/lib/predict';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

type Invite = { code: string; expiresAt: Date };

export default function Home() {
  const { family } = useSession();
  const [nightFeeds, setNightFeeds] = useState<NightFeeds | null>(null);
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
      <NextUp onNightFeeds={setNightFeeds} />
      <QuickLog />
      <CheckinCard />
      {nightFeeds ? <NightFeedsCard value={nightFeeds} /> : null}
      <Button title="Chat" variant="secondary" onPress={() => router.push('/chat')} />
      <Timeline />
      <Button title="Sign out" variant="secondary" onPress={() => void supabase.auth.signOut()} />
      <Button title="Delete account" variant="secondary" onPress={() => router.push('/delete-account')} />
    </Screen>
  );
}

function InviteCard() {
  const { refreshFamily } = useSession();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const now = useNow(60_000);
  const expired = invite !== null && invite.expiresAt.getTime() <= now.getTime();

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
    <ThemedView type="surface" style={styles.card}>
      <ThemedText type="smallBold">Invite your partner</ThemedText>
      {invite ? (
        <View style={styles.inviteBody}>
          <ThemedText
            selectable={!expired}
            themeColor={expired ? 'textSecondary' : 'text'}
            style={[styles.code, expired && styles.expired]}>
            {invite.code}
          </ThemedText>
          {expired ? (
            <ThemedText type="small" themeColor="textSecondary">
              This code has expired. Make a new one for your partner.
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              They sign up, tap “I have a code”, and enter it. Works once, until{' '}
              {invite.expiresAt.toLocaleString([], {
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </ThemedText>
          )}
          {expired ? null : (
            <Button
              title="Share code"
              onPress={() =>
                void Share.share({ message: `Join me on Little Rhythm with this code: ${invite.code}` })
              }
            />
          )}
          <Button title="New code" variant={expired ? 'primary' : 'secondary'} onPress={onCreate} busy={busy} />
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
  expired: { textDecorationLine: 'line-through' },
});
