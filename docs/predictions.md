# Predictions and reminders (F4, F7)

The home card shows four windows: next feed, next nap (or expected wake while
asleep), bedtime-routine start and bedtime. **Code computes them; Muse only
explains them.** One engine, `supabase/functions/_shared/predict.ts`, serves both
the `predict` function (the card) and the chat agent's `get_next_windows` tool,
so the card and the chat always agree. Results are computed on request and never
stored.

These are scheduling estimates from the family's own log and typical ranges for
the age. They are **not medical advice**, and the app and the buddy never present
them as advice.

```
app (NextUp card) ──{tz, tz_offset_minutes}──▶ predict function
        verify JWT → rate limit (240/h) → caller's baby via their JWT (exactly one row)
        7 days of events + any open sleep, read with the caller's JWT (RLS)
        predict({ now, zone, birthDate, events })        _shared/predict.ts (pure)
◀── { age_weeks, feed, nap, routine, bedtime, wake, zone } ──
app: card rows + local reminders (this phone only, if switched on)

chat function ── get_next_windows ──▶ the same engine, bound to the session baby
```

## Engine rules

Each slot is `{ window: { start, end, basis, samples }, reason: null }` or
`{ window: null, reason }`. The basis is `age`, `personal` or `blend`.

- **Personal medians from the last 7 days**
  - **Feed interval**: start to start. Feeds starting within 45 min of a cluster's
    first feed count as one feed (both breast sides, top-ups). Gaps over 8 h are
    treated as missed logs and dropped.
  - **Wake window**: from a sleep's end to the next sleep's start, counted only
    when the wake begins between 06:00 and 18:00 local. Gaps under 10 min are dropped.
  - **Nap length**: finished sleeps that start between 06:00 and 18:00 and last
    10 min to 4 h.
  - **Night-sleep start**: the first sleep each evening that starts between 18:00
    and 23:59 local and lasts at least 4 h.
- **Personal, blend or age**

  | Sample | personal if n ≥ | blend if n in | otherwise | half-width |
  |---|---|---|---|---|
  | feed interval | 12 | 4–11 | age | ±20 min |
  | wake window | 10 | 3–9 | age | ±15 min |
  | nap length | 6 | 2–5 | age | ±20 min |
  | night-sleep start | 4 | 2–3 | age | ±30 min |

  - Blend: `centre = w·median + (1−w)·bandMiddle`, where `w = n / personalMin`.
  - The centre is clamped to the age band, and the window (centre ± half-width) is
    cut to the band. A window never leaves the age band.
  - With too few samples, the window is the whole band.
- **Anchors**
  - The next feed counts from the start of the last feed cluster.
  - The next nap counts from the last sleep end.
  - **While a sleep is in progress:**
    - there is no nap window (`asleep`);
    - the expected wake is the sleep's start plus the nap-length window;
    - if it is a night sleep (it started between 18:00 and 05:59), there is no
      wake range (`night_sleep`).
  - A nap that would start at bedtime or during the night is reported as
    `bedtime_next`.
- **Bedtime**
  - Bedtime is tonight's window. It moves to tomorrow once tonight's window has
    passed, or once a night sleep has started this evening.
  - The routine starts 30 minutes before bedtime.
  - Under 8 weeks, both are `too_young` ("No set bedtime yet").
- **Time zones**
  - Durations are measured in real time.
  - Clock times (daytime, bedtime) are converted through the phone's IANA zone,
    so a 7-day window across a DST change (25 Oct 2026 in the EU) is right.
  - When the phone sends no zone the runtime knows, the request's UTC offset is
    used instead. Tests: `_shared/predict.test.ts` ("DST").

### Age bands (`_shared/predict-constants.ts`)

| Weeks | Wake window | Feed interval | Nap length | Bedtime |
|---|---|---|---|---|
| 0–3 | 35–60 min | 2–3 h | 30–120 min | none yet |
| 4–7 | 60–90 | 2–3 h | 30–120 | none yet |
| 8–12 | 75–105 | 2.5–3.5 h | 30–120 | 19:30–21:30 |
| 13–16 | 90–120 | 2.5–4 h | 30–120 | 19:00–21:00 |
| 17–25 | 105–150 | 3–4 h | 40–120 | 19:00–20:30 |
| 26–38 | 150–210 | 3–4.5 h | 45–120 | 18:30–20:00 |
| 39–51 | 180–240 | 3.5–5 h | 60–120 | 18:30–20:00 |
| 52–77 | 240–330 | 3–5 h | 60–150 | 18:30–20:00 |
| 78+ | 300–360 | 3–5 h | 60–150 | 19:00–20:30 |

Sources:
- **Feed intervals:** NHS breastfeeding guidance and AAP HealthyChildren.org, "How Often and
  How Much Should Your Baby Eat?".
- **Bedtimes:** AAP HealthyChildren.org sleep pages, and Mindell et al. 2010, *Sleep
  Medicine*, "Cross-cultural differences in infant and toddler sleep".
- **Wake windows and nap lengths:** heuristics. No clinical guideline publishes
  them. They were sanity-checked against total sleep per day (AASM consensus,
  Paruthi et al. 2016).
- **Other caveats:** feed intervals after 6 months depend on solids. The 45 min
  cluster gap and the 8 h cutoff are our own choices.

## `predict` function

- POST `{ tz?, tz_offset_minutes? }`, at most 1 KB, strict keys, at least one usable
  zone (`400 invalid_time_zone` otherwise).
- Uses the same session-baby rule as `chat`: `not_in_family` and `multiple_babies` → 409.
- Rate limit: `consume_rate_limit('predict', 3600, 240)`.
- Logs carry error codes only, never events or windows.
- Tests:
  - `predict/request.test.ts` (unit).
  - `supabase/tests/functions/predict.test.ts` against the local stack: 401
    without a JWT, 409 without a baby, 400 for an injected `baby_id`, and 200
    with the expected shape.

## Chat: `get_next_windows`

- It takes no arguments. Anything the model sends (a `baby_id`, say) is ignored.
- The tool result has local wall-clock times and the basis, with no ids.
- The system prompt tells the model to report only the returned ranges, never to
  invent or shift them, and to call them estimates, not advice.
- Tests: `_shared/agent.test.ts` ("get_next_windows").

## App

- **The card** (`components/next-up.tsx`) calls `predict`:
  - on mount and on focus;
  - 2 s after the last change to today's events (taps, confirmed chat cards, the
    partner's realtime changes).
- **What it shows:**
  - local time ranges, each with its basis: "based on the last 7 days", "based on
    the last 7 days and age" or "typical for this age";
  - an overdue marker when a window has passed;
  - loading, empty and error states.
- **Reminders** (`lib/reminders.ts`, logic in `lib/reminder-plan.ts`):
  - **Toggle and permission:** there is one toggle per phone, stored in
    expo-secure-store. The permission prompt (Android 13+) appears the first time
    it is turned on. Reminders use a single `reminders` channel.
  - **Rescheduling:** after every prediction, this phone's prediction reminders
    are rescheduled: feed and nap 10 min before the window opens, the routine at
    its start. Times already in the past are skipped. The text contains no names.
  - **Fixed identifiers:** the reminders use `predict-feed`, `predict-nap` and
    `predict-routine`. Only these are cancelled, both when rescheduling and when
    the toggle is turned off. Other reminders, such as the daily check-in, are
    never touched (`app/src/lib/reminder-plan.test.ts`).
  - **Limitation:** reminders reflect the last prediction this phone saw. If the
    app isn't opened after the partner logs a feed, the old reminder still fires.

## Running the tests

Deno is run through npx, with no global install. Version in use: **deno 2.9.6**
(`npx -y deno@2 --version`). Day 7 CI should pin `deno@2`.

```sh
npx -y deno@2 test -A supabase/functions/                        # engine, requests, agent
npx -y deno@2 test app/src/lib/reminder-plan.test.ts             # reminder ids
supabase start
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  npx -y deno@2 test -A supabase/tests/functions/
```

`scripts/day5-scratch/seed-3mo.ts` (gitignored) seeds the 3-month-old fixture
into the **local** stack and prints a `curl` for `predict`. It refuses any host
other than `127.0.0.1` or `localhost`.
