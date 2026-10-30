import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Button, Screen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Colors, type Palette } from '@/constants/theme';
import { configureNotifications } from '@/lib/reminders';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();
configureNotifications();

/** The navigator's colours from the app palette (the stock themes use iOS blue). */
function navigationTheme(base: Theme, palette: Palette): Theme {
  return {
    ...base,
    colors: {
      primary: palette.link,
      background: palette.background,
      card: palette.background,
      text: palette.text,
      border: palette.border,
      notification: palette.error,
    },
  };
}

const NAVIGATION = {
  light: navigationTheme(DefaultTheme, Colors.light),
  dark: navigationTheme(DarkTheme, Colors.dark),
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? NAVIGATION.dark : NAVIGATION.light}>
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { session, family, loading, familyError, refreshFamily } = useSession();

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;

  if (session && familyError && !family) {
    return (
      <Screen>
        <ThemedText type="subtitle">Can&apos;t reach Little Rhythm</ThemedText>
        <ThemedText themeColor="textSecondary">Check your connection and try again.</ThemedText>
        <Button title="Try again" onPress={() => void refreshFamily()} />
      </Screen>
    );
  }

  const signedIn = session !== null;
  const hasFamily = family !== null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !hasFamily} redirectTo={signedIn ? '/' : '/sign-in'}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && hasFamily} redirectTo={signedIn ? '/welcome' : '/sign-in'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
