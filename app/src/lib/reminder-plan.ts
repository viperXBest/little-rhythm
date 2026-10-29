// Which local reminders to schedule for a prediction, and how to resync them.
// No imports: this runs under the app and under `deno test`
// (reminder-plan.test.ts). The expo-notifications binding is in reminders.ts.
//
// Prediction reminders use fixed identifiers and only those are ever
// cancelled, so other reminders (the daily check-in) are never touched.

export const PREDICTION_REMINDER_IDS = ['predict-feed', 'predict-nap', 'predict-routine'] as const;
export type PredictionReminderId = (typeof PREDICTION_REMINDER_IDS)[number];

/** Feed and nap reminders fire this long before the window opens. */
export const LEAD_MINUTES = 10;

export type Reminder = { identifier: PredictionReminderId; date: Date; title: string; body: string };

/** The parts of a prediction the reminders need (structurally a Prediction). */
export type ReminderWindows = {
  feed: { window: { start: string } | null };
  nap: { window: { start: string } | null };
  routine: { window: { start: string } | null };
};

/** Where reminders are scheduled; reminders.ts backs this with expo-notifications. */
export type Scheduler = {
  cancel: (identifier: string) => Promise<void>;
  schedule: (reminder: Reminder) => Promise<void>;
};

// No baby name or other personal data: these show on the lock screen.
const TEXT: Record<PredictionReminderId, { title: string; body: string }> = {
  'predict-feed': { title: 'Feed window soon', body: `The next feed window opens in about ${LEAD_MINUTES} minutes.` },
  'predict-nap': { title: 'Nap window soon', body: `The next nap window opens in about ${LEAD_MINUTES} minutes.` },
  'predict-routine': { title: 'Bedtime routine', body: 'Time to start the bedtime routine.' },
};

export function planReminders(windows: ReminderWindows, now: Date): Reminder[] {
  const lead = LEAD_MINUTES * 60_000;
  const candidates: [PredictionReminderId, string | undefined, number][] = [
    ['predict-feed', windows.feed.window?.start, lead],
    ['predict-nap', windows.nap.window?.start, lead],
    ['predict-routine', windows.routine.window?.start, 0],
  ];
  const out: Reminder[] = [];
  for (const [identifier, start, before] of candidates) {
    if (start === undefined) continue;
    const at = Date.parse(start) - before;
    // Skip times already past (and unparseable ones).
    if (!Number.isFinite(at) || at <= now.getTime()) continue;
    out.push({ identifier, date: new Date(at), ...TEXT[identifier] });
  }
  return out;
}

/** Cancels this app's prediction reminders, and nothing else. */
export async function clearPredictionReminders(scheduler: Scheduler): Promise<void> {
  await Promise.all(PREDICTION_REMINDER_IDS.map((id) => scheduler.cancel(id)));
}

/** Replaces the prediction reminders with the ones for this prediction. */
export async function syncPredictionReminders(
  scheduler: Scheduler,
  windows: ReminderWindows,
  now: Date,
): Promise<Reminder[]> {
  await clearPredictionReminders(scheduler);
  const plan = planReminders(windows, now);
  for (const reminder of plan) await scheduler.schedule(reminder);
  return plan;
}
