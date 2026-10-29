import { Stack } from 'expo-router';

import { useSession } from '@/lib/session';
import { TodayEventsProvider } from '@/lib/today-events';

export default function Layout() {
  const { family } = useSession();
  if (!family) return null;
  return (
    <TodayEventsProvider babyId={family.baby.id}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="event/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="delete-account" />
      </Stack>
    </TodayEventsProvider>
  );
}
