import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  clearPredictionReminders,
  syncPredictionReminders,
  type ReminderWindows,
  type Scheduler,
} from '@/lib/reminder-plan';

// Local reminders before predicted windows. One toggle per phone, stored on the
// device (not a secret; secure-store because AsyncStorage isn't in the build).
// Only the prediction reminders' own ids are ever cancelled (reminder-plan.ts).

const ENABLED_KEY = 'reminders_enabled';
const CHANNEL_ID = 'reminders';

const scheduler: Scheduler = {
  cancel: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
  schedule: async (reminder) => {
    await Notifications.scheduleNotificationAsync({
      identifier: reminder.identifier,
      content: { title: reminder.title, body: reminder.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.date,
        channelId: CHANNEL_ID,
      },
    });
  },
};

/** Shows reminders while the app is open too. Call once at startup. */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
  });
}

async function ensureChannel(): Promise<void> {
  // Android 13+ needs a channel before it shows the permission prompt.
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Reminders',
    importance: AndroidImportance.DEFAULT,
  });
}

export async function remindersEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ENABLED_KEY)) === '1';
}

/** Turns reminders on, asking for permission the first time. */
export async function enableReminders(): Promise<'enabled' | 'denied'> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (!granted) return 'denied';
  await SecureStore.setItemAsync(ENABLED_KEY, '1');
  return 'enabled';
}

export async function disableReminders(): Promise<void> {
  await SecureStore.deleteItemAsync(ENABLED_KEY);
  await clearPredictionReminders(scheduler);
}

/** Reschedules the prediction reminders if this phone has them on. Never throws. */
export async function syncReminders(windows: ReminderWindows): Promise<void> {
  try {
    if (!(await remindersEnabled())) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    await ensureChannel();
    await syncPredictionReminders(scheduler, windows, new Date());
  } catch {
    // Reminders are best effort; the card still shows the windows.
  }
}
