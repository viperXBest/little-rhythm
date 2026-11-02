import { Link, router, type Href } from 'expo-router';
import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Mascot, type MascotProps } from '@/components/illustrations';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, MinTouch, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Shared pieces for the auth, onboarding and account screens (v1.1.0, Cloud Lullaby).

/**
 * `Screen` for forms: on Android the window doesn't resize for the keyboard (edge-to-edge),
 * so the keyboard covered the focused field and the primary button. `height` shrinks the
 * scroll view instead and Android scrolls the focused field into view (as in chat).
 * `top` pins the content to the top instead of centring it.
 */
export function FormScreen({ children, top = false }: { children: ReactNode; top?: boolean }) {
  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView style={styles.fill}>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={[styles.content, top && styles.top]}
            keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

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
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  top: { justifyContent: 'flex-start' },
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
