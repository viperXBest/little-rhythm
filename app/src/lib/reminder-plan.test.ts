// Run with Deno (the app has no JS test runner):
//   deno test app/src/lib/reminder-plan.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assertEquals } from 'jsr:@std/assert@1.0.13';

import {
  CHECKIN_REMINDER_ID,
  clearCheckinReminder,
  clearPredictionReminders,
  planCheckinReminder,
  planReminders,
  PREDICTION_REMINDER_IDS,
  type Reminder,
  type ReminderWindows,
  type Scheduler,
  syncCheckinReminder,
  syncPredictionReminders,
} from './reminder-plan.ts';

const NOW = new Date('2026-10-29T12:00:00Z');

const windows = (feed: string | null, nap: string | null, routine: string | null): ReminderWindows => ({
  feed: { window: feed ? { start: feed } : null },
  nap: { window: nap ? { start: nap } : null },
  routine: { window: routine ? { start: routine } : null },
});

/** A scheduler like the OS one: a map of scheduled reminders by identifier. */
function fakeScheduler(initial: Record<string, string>) {
  const scheduled = new Map<string, string>(Object.entries(initial));
  const cancelled: string[] = [];
  const scheduler: Scheduler = {
    cancel: (id) => {
      cancelled.push(id);
      scheduled.delete(id);
      return Promise.resolve();
    },
    schedule: (r: Reminder) => {
      scheduled.set(r.identifier, r.date.toISOString());
      return Promise.resolve();
    },
  };
  return { scheduler, scheduled, cancelled };
}

Deno.test('feed and nap 10 min before the window, routine at its start', () => {
  const plan = planReminders(
    windows('2026-10-29T13:40:00Z', '2026-10-29T12:45:00Z', '2026-10-29T16:30:00Z'),
    NOW,
  );
  assertEquals(
    plan.map((r) => [r.identifier, r.date.toISOString()]),
    [
      ['predict-feed', '2026-10-29T13:30:00.000Z'],
      ['predict-nap', '2026-10-29T12:35:00.000Z'],
      ['predict-routine', '2026-10-29T16:30:00.000Z'],
    ],
  );
});

Deno.test('times in the past and missing windows are skipped', () => {
  // Nap opens in 5 min: its reminder (10 min before) is already past.
  const plan = planReminders(windows('2026-10-29T11:00:00Z', '2026-10-29T12:05:00Z', null), NOW);
  assertEquals(plan, []);
  assertEquals(planReminders(windows('not a time', null, null), NOW), []);
});

Deno.test('resync cancels only the prediction ids; the check-in reminder survives', async () => {
  const os = fakeScheduler({
    'checkin-daily': '2026-10-29T18:00:00.000Z',
    'predict-feed': '2026-10-29T12:30:00.000Z',
    'predict-nap': '2026-10-29T12:40:00.000Z',
  });
  await syncPredictionReminders(os.scheduler, windows('2026-10-29T15:00:00Z', null, null), NOW);
  assertEquals([...os.cancelled].sort(), [...PREDICTION_REMINDER_IDS].sort());
  assertEquals(Object.fromEntries(os.scheduled), {
    'checkin-daily': '2026-10-29T18:00:00.000Z',
    'predict-feed': '2026-10-29T14:50:00.000Z',
  });
});

Deno.test('turning reminders off clears only the prediction ids', async () => {
  const os = fakeScheduler({
    'checkin-daily': '2026-10-29T18:00:00.000Z',
    'predict-feed': '2026-10-29T12:30:00.000Z',
    'predict-routine': '2026-10-29T16:30:00.000Z',
  });
  await clearPredictionReminders(os.scheduler);
  assertEquals(os.cancelled.includes('checkin-daily'), false);
  assertEquals(Object.fromEntries(os.scheduled), { 'checkin-daily': '2026-10-29T18:00:00.000Z' });
});

Deno.test('no reminder text carries a name or personal data', () => {
  const plan = planReminders(
    windows('2026-10-29T13:40:00Z', '2026-10-29T12:45:00Z', '2026-10-29T16:30:00Z'),
    NOW,
  );
  for (const r of plan) {
    // Fixed text only: nothing from the family, the baby or the log.
    assertEquals(/\b(she|he|her|his)\b/i.test(`${r.title} ${r.body}`), false);
  }
  assertEquals(new Set(plan.map((r) => r.body)).size, 3);
});

// ---- Daily check-in ---------------------------------------------------------
// Local-time Dates (new Date(y, m, d, h)), so these pass in any machine zone.

const local = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);

Deno.test('check-in: 21:00 today while unanswered and before 21:00', () => {
  const r = planCheckinReminder(local(29, 12), false);
  assertEquals([r.identifier, r.date.getTime()], [CHECKIN_REMINDER_ID, local(29, 21).getTime()]);
});

Deno.test('check-in: tomorrow 21:00 once answered, or once 21:00 has passed', () => {
  assertEquals(planCheckinReminder(local(29, 12), true).date.getTime(), local(30, 21).getTime());
  assertEquals(planCheckinReminder(local(29, 21), false).date.getTime(), local(30, 21).getTime());
  assertEquals(planCheckinReminder(local(29, 23, 30), false).date.getTime(), local(30, 21).getTime());
});

Deno.test('check-in: no names in the text', () => {
  const r = planCheckinReminder(local(29, 12), false);
  assertEquals([r.title, r.body], ['Daily check-in', 'Two quick questions for you and your partner.']);
});

Deno.test('check-in sync cancels only checkin-daily and keeps the prediction reminders', async () => {
  const fake = fakeScheduler({
    'predict-feed': 'x',
    'predict-nap': 'y',
    'predict-routine': 'z',
    [CHECKIN_REMINDER_ID]: 'old',
  });
  await syncCheckinReminder(fake.scheduler, local(29, 12), true);
  assertEquals(fake.cancelled, [CHECKIN_REMINDER_ID]);
  for (const id of PREDICTION_REMINDER_IDS) assertEquals(fake.scheduled.has(id), true);
  assertEquals(fake.scheduled.get(CHECKIN_REMINDER_ID), local(30, 21).toISOString());

  await clearCheckinReminder(fake.scheduler);
  assertEquals(fake.cancelled, [CHECKIN_REMINDER_ID, CHECKIN_REMINDER_ID]);
  for (const id of PREDICTION_REMINDER_IDS) assertEquals(fake.scheduled.has(id), true);
});

Deno.test('prediction sync and clear never cancel checkin-daily', async () => {
  const fake = fakeScheduler({ [CHECKIN_REMINDER_ID]: 'keep' });
  await syncPredictionReminders(fake.scheduler, windows('2026-10-29T13:40:00Z', null, null), NOW);
  await clearPredictionReminders(fake.scheduler);
  assertEquals(fake.cancelled.includes(CHECKIN_REMINDER_ID), false);
  assertEquals(fake.scheduled.get(CHECKIN_REMINDER_ID), 'keep');
});
