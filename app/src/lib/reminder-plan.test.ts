// Run with Deno (the app has no JS test runner):
//   deno test app/src/lib/reminder-plan.test.ts
// Excluded from the app's tsc and eslint, which don't know Deno.test.
import { assertEquals } from 'jsr:@std/assert@1.0.13';

import {
  clearPredictionReminders,
  planReminders,
  PREDICTION_REMINDER_IDS,
  type Reminder,
  type ReminderWindows,
  type Scheduler,
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
