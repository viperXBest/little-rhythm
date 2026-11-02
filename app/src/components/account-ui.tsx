import { Link, router, type Href } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Mascot, type MascotProps } from '@/components/illustrations';
import { ThemedText } from '@/components/themed-text';
import { MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Shared pieces for the auth, onboarding and account screens (v1.1.0, Cloud Lullaby).

/**
 * A friendly screen header: Fluff (decorative), the title as a header and an optional lead line.
 * `pose` null leaves Fluff out (serious screens such as delete-account never show him).
 */
export function Hero({
  title,
  lead,
  pose = 'awake',
  big = false,
}: {
  title: string;
  lead?: ReactNode;
  pose?: MascotProps['pose'] | null;
  /** The app name on sign-in uses the display type; other screens the title type. */
  big?: boolean;
}) {
  return (
    <View style={styles.hero}>
      {pose ? <Mascot pose={pose} size={big ? 150 : 128} /> : null}
      <ThemedText type={big ? 'display' : 'title'} accessibilityRole="header" style={styles.center}>
        {title}
      </ThemedText>
      {lead ? (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {lead}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** A text link to another screen with a 48 dp touch target. */
export function TextLink({ href, children }: { href: Href; children: string }) {
  const theme = useTheme();
  return (
    <Link href={href} replace asChild>
      <Pressable
        accessibilityRole="link"
        style={({ pressed }) => [styles.link, pressed && { backgroundColor: theme.surface }]}>
        <ThemedText type="linkPrimary" style={styles.center}>
          {children}
        </ThemedText>
      </Pressable>
    </Link>
  );
}

/** Screen header for pushed account screens: a 48 dp Back button, then the title. */
export function BackHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.backHeader}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => router.back()}
        style={({ pressed }) => [styles.back, pressed && { backgroundColor: theme.surface }]}>
        <Icon name="back" size={24} />
        <ThemedText type="link" themeColor="link">
          Back
        </ThemedText>
      </Pressable>
      <ThemedText type="title" accessibilityRole="header">
        {title}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.two },
  center: { textAlign: 'center' },
  link: {
    minHeight: MinTouch,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.button,
  },
  backHeader: { gap: Spacing.two, alignItems: 'flex-start' },
  back: {
    minHeight: MinTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingRight: Spacing.three,
    paddingLeft: Spacing.one,
    marginLeft: -Spacing.one,
    borderRadius: Radius.button,
  },
});
