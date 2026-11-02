import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Shelf } from '@/components/card';
import { CheckinCard } from '@/components/checkin-card';
import { Chip } from '@/components/controls';
import { Button, ErrorText, Screen } from '@/components/form';
import { Icon, Illustration, Mascot } from '@/components/illustrations';
import { NextUp } from '@/components/next-up';
import { NightFeedsCard } from '@/components/night-feeds-card';
import { QuickLog } from '@/components/quick-log';
import { Loading } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Timeline } from '@/components/timeline';
import { font, MaxContentWidth, MinTouch, Radius, Spacing, Sticker } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { ageInWeeks } from '@/lib/dates';
import { createPairCode, pairErrorMessage } from '@/lib/pair';
import type { NightFeeds } from '@/lib/predict';
import { useSession } from '@/lib/session';

type Invite = { code: string; expiresAt: Date };

/** Font scale from which the header stacks (name above Fluff and the settings button). */
const HEADER_STACK_FONT_SCALE = 1.5;

export default function Home() {
  const { family } = useSession();
  const [nightFeeds, setNightFeeds] = useState<NightFeeds | null>(null);
  if (!family) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <Header name={family.baby.name} weeks={ageInWeeks(family.baby.birthDate)} />
          {family.memberCount < 2 ? (
            <InviteCard />
          ) : (
            <ThemedText themeColor="textSecondary">You and your partner are both here.</ThemedText>
          )}
          <NextUp onNightFeeds={setNightFeeds} />
          <QuickLog />
          <CheckinCard />
          {nightFeeds ? <NightFeedsCard value={nightFeeds} /> : null}
          <Timeline />
        </ScrollView>
        <ChatButton />
      </SafeAreaView>
    </ThemedView>
  );
}

function Header({ name, weeks }: { name: string; weeks: number }) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= HEADER_STACK_FONT_SCALE;
  return (
    <View style={stacked ? styles.headerStacked : styles.header}>
      <View style={styles.headerText}>
        <ThemedText type="display" accessibilityRole="header">
          {name}
        </ThemedText>
        <Chip label={weeks === 1 ? '1\u00A0week old' : `${weeks}\u00A0weeks old`} tone="info" />
      </View>
      <View style={styles.headerSide}>
        <Mascot pose="sleeping" size={stacked ? 96 : 112} />
        <SettingsButton />
      </View>
    </View>
  );
}

function SettingsButton() {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Settings"
      onPress={() => router.push('/settings')}
      style={({ pressed }) => [
        styles.settings,
        { backgroundColor: pressed ? theme.border : theme.surface, borderColor: theme.border },
      ]}>
      <Icon name="settings" size={24} />
    </Pressable>
  );
}

/** Sticker-style Chat button: a primary mic square and the label, docked in a bar below the scroll. */
function ChatButton() {
  const theme = useTheme();
  // Light: the mockup's `text` outline and shelf. Dark: the tint border and the dark shelf (no glare).
  const dark = useColorScheme() === 'dark';
  return (
    <View style={[styles.dock, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Chat" onPress={() => router.push('/chat')}>
        {({ pressed }) => (
          <Shelf
            radius={Radius.fab}
            shelf={dark ? 'shelf' : 'text'}
            sunk={pressed}
            faceStyle={[
              styles.fab,
              {
                backgroundColor: pressed ? theme.surface : theme.card,
                borderColor: dark ? theme.primaryTintBorder : theme.text,
              },
            ]}>
            <View
              style={[styles.fabMic, { backgroundColor: theme.primaryTint, borderColor: theme.primaryTintBorder }]}>
              <Icon name="mic" size={28} color="primaryTintIcon" fill="primaryTintPressed" />
            </View>
            <ThemedText type="buttonLarge" style={styles.fabLabel}>
              Chat
            </ThemedText>
          </Shelf>
        )}
      </Pressable>
    </View>
  );
}

function InviteCard() {
  const theme = useTheme();
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
    <Card>
      <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {/* While a live code waits for the partner, Fluff waits too. */}
        {invite && !expired ? <Mascot pose="waiting" size={140} /> : <Illustration name="invitePartner" size={180} />}
      </View>
      <ThemedText type="cardTitle" accessibilityRole="header">
        Invite your partner
      </ThemedText>
      {invite ? (
        <View style={styles.inviteBody}>
          <View style={[styles.codeBox, { backgroundColor: theme.infoBackground, borderColor: theme.border }]}>
            <ThemedText
              numberOfLines={1}
              adjustsFontSizeToFit
              selectable={!expired}
              themeColor={expired ? 'textSecondary' : 'text'}
              style={[styles.code, font('heading', 800), expired && styles.expired]}>
              {invite.code}
            </ThemedText>
          </View>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    gap: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
    paddingHorizontal: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  headerStacked: { gap: Spacing.two },
  headerText: { flex: 1, gap: Spacing.two, alignItems: 'flex-start' },
  headerSide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'flex-end', gap: Spacing.one },
  settings: {
    width: MinTouch,
    height: MinTouch,
    borderRadius: Radius.field,
    borderWidth: Sticker.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dock: {
    alignItems: 'flex-end',
    borderTopWidth: Sticker.outline,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: Sticker.outline,
    padding: Spacing.two,
    paddingRight: Spacing.four,
  },
  fabMic: {
    width: MinTouch,
    height: MinTouch,
    borderRadius: Radius.field,
    borderWidth: Sticker.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: { flexShrink: 1 },
  art: { alignItems: 'center' },
  inviteBody: { gap: Spacing.two },
  codeBox: { borderRadius: Radius.field, borderWidth: Sticker.outline, paddingHorizontal: Spacing.two },
  // Baloo 2 800, spaced. The code alphabet has no 0/O or 1/I, so it reads unambiguously.
  code: {
    fontSize: 34,
    lineHeight: 46,
    letterSpacing: 5,
    textAlign: 'center',
    paddingVertical: Spacing.two,
  },
  expired: { textDecorationLine: 'line-through' },
});
