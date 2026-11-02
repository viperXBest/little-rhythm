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
import { Fonts, MaxContentWidth, MinTouch, Radius, Spacing, Sticker } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { ageInWeeks } from '@/lib/dates';
import { createPairCode, pairErrorMessage } from '@/lib/pair';
import type { NightFeeds } from '@/lib/predict';
import { useSession } from '@/lib/session';

type Invite = { code: string; expiresAt: Date };

/**
 * The floating Chat button. The home scroll ends `inset + gap` below its measured height, so
 * the last timeline row always scrolls clear of it (the button grows with the font scale).
 */
const CHAT_FAB = {
  /** Distance from the bottom and right edges of the safe area. */
  inset: Spacing.three,
  /** Room between the last row and the button's top. */
  gap: Spacing.three,
  /** Height before the first layout: the 48 dp mic square + padding + outline + shelf. */
  initialHeight: MinTouch + 2 * Spacing.two + 2 * Sticker.outline + Sticker.shelf,
} as const;

/** Font scale from which the header stacks (name above Fluff and the settings button). */
const HEADER_STACK_FONT_SCALE = 1.5;

export default function Home() {
  const { family } = useSession();
  const [nightFeeds, setNightFeeds] = useState<NightFeeds | null>(null);
  const [fabHeight, setFabHeight] = useState<number>(CHAT_FAB.initialHeight);
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
          contentContainerStyle={[styles.content, { paddingBottom: fabHeight + CHAT_FAB.inset + CHAT_FAB.gap }]}
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
        <ChatButton onHeight={setFabHeight} />
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
        <Chip label={weeks === 1 ? '1 week old' : `${weeks} weeks old`} tone="info" />
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

/** Sticker-style floating button: a primary mic square and the label, bottom right. */
function ChatButton({ onHeight }: { onHeight: (height: number) => void }) {
  const theme = useTheme();
  return (
    <View
      pointerEvents="box-none"
      style={styles.fabWrap}
      onLayout={(e) => onHeight(Math.ceil(e.nativeEvent.layout.height))}>
      <Pressable accessibilityRole="button" accessibilityLabel="Chat" onPress={() => router.push('/chat')}>
        {({ pressed }) => (
          <Shelf
            radius={Radius.fab}
            shelf="text"
            sunk={pressed}
            faceStyle={[
              styles.fab,
              { backgroundColor: pressed ? theme.surface : theme.card, borderColor: theme.text },
            ]}>
            <View style={[styles.fabMic, { backgroundColor: theme.primary }]}>
              <Icon name="mic" size={28} color="onPrimary" fill="primaryPressed" />
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
        <Illustration name="invitePartner" size={180} />
      </View>
      <ThemedText type="cardTitle" accessibilityRole="header">
        Invite your partner
      </ThemedText>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    gap: Spacing.four,
    paddingTop: Spacing.four,
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
  fabWrap: { position: 'absolute', right: CHAT_FAB.inset + Spacing.two, bottom: CHAT_FAB.inset },
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabLabel: { flexShrink: 1 },
  art: { alignItems: 'center' },
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
