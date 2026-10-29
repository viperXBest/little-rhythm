# Couple layer (F6) and the check-in reminder (F7)

Two small things for the two parents: a daily check-in and the night-feed
balance. Neither goes to the AI.

## Daily check-in

- **Two fixed questions**, once per parent per day:
  - mood, 1–5 (1 = rough, 5 = great);
  - "one thing that would help me today", up to 280 characters (may be empty).
- **The day** is the phone's local date in its IANA zone (`checkinDay()` in
  `app/src/lib/checkin.ts`).
- **Reveal.** You always see your own answers. The partner's answers become
  readable only once you have answered the same day. This is RLS (`checkins_select`
  with `has_checked_in(family_id, day)`), not the app. The reveal arrives live:
  realtime checks the subscriber's select policy, so the partner's insert reaches
  you only once you have answered that day.
- **Rules in the database** (`20261029100000_chat_checkin.sql`):
  - `answers` is exactly `{ mood: 1..5, help: string ≤ 280 }`;
  - `day` must be within a day of the server's date (any zone's local date), so
    no one can answer ahead;
  - no update policy, so answers lock once submitted;
  - one answer per person per day (unique key).
- **Tests:** `supabase/tests/03_checkin_reveal.test.sql`, and the realtime test in
  `supabase/tests/realtime/realtime_rls.test.ts`.

## Check-in reminder

- Id `checkin-daily`, a DATE trigger at **21:00 local**:
  - 21:00 today while today's check-in is unanswered;
  - 21:00 tomorrow once it is answered, or once 21:00 has passed.
- It uses the same reminders toggle and channel as the prediction reminders.
- Its sync cancels only `checkin-daily`; the prediction sync cancels only the
  `predict-*` ids. Turning reminders off cancels both sets by id. There is no
  `cancelAllScheduledNotificationsAsync`.
- The text has no names.
- Logic in `app/src/lib/reminder-plan.ts`, tests in `reminder-plan.test.ts`.

## Night-feed balance

- **What it counts:** feeds logged between 22:00 and 06:00 local over the 7 most
  recent nights that have started, counted per `created_by`: "you" (the caller) and
  "your partner". The card says "Night feeds logged by each of you": it counts
  logs, not who fed the baby. Both breast sides are two logs.
- **Partner:** null until someone has paired. Feeds logged by anyone else (a former
  member, a deleted account) are not counted.
- **Nights** are built from local clock times in the phone's IANA zone. The DST
  night of 24–25 Oct 2026 in Bucharest is 9 hours long, and feeds in both 03:30s
  count. Tonight counts once 22:00 has passed.
- **Where it runs:** `supabase/functions/_shared/night-feeds.ts` (pure, Deno tests
  in `night-feeds.test.ts`). The `predict` function returns it as
  `night_feeds: { nights, you, partner }` from its own query, which starts at the
  oldest night's 22:00. That start can be more than 7×24 h back, so the query is
  separate from the prediction events.
- **Privacy:** counts only, no ids. It is not part of the chat agent's context.
