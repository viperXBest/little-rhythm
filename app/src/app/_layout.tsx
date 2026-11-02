import { Baloo2_600SemiBold } from '@expo-google-fonts/baloo-2/600SemiBold';
import { Baloo2_700Bold } from '@expo-google-fonts/baloo-2/700Bold';
import { Baloo2_800ExtraBold } from '@expo-google-fonts/baloo-2/800ExtraBold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Button, Screen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Colors, setCustomFontsAvailable, type Palette } from '@/constants/theme';
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

// Only the weights the type scale uses (FontFamily in constants/theme.ts). Subpath imports keep
// the other weights out of the bundle.
const FONTS = {
  Baloo2_600SemiBold,
  Baloo2_700Bold,
  Baloo2_800ExtraBold,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
};

const NAVIGATION = {
  light: navigationTheme(DefaultTheme, Colors.light),
  dark: navigationTheme(DarkTheme, Colors.dark),
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts(FONTS);
  // The splash stays up (RootNavigator hides it) until the fonts are in. On a load error the
  // app falls back to the system font instead of blocking.
  if (!fontsLoaded && !fontError) return null;
  setCustomFontsAvailable(fontsLoaded);
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
