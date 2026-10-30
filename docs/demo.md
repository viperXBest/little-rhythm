# Demo script

Under 3 minutes. Two Android phones side by side, signed in as **Mom** and **Dad** on
the same baby.

**Before every rehearsal and the recording:** run `seed-demo`, so the log, the windows
and the check-in start from the same state each time.

```sh
# scripts/seed-demo/.env from .env.example (gitignored): URL, service-role key, two demo logins
npx -y deno@2 run --env-file=scripts/seed-demo/.env --allow-env --allow-net \
  scripts/seed-demo/seed.ts --project <ref> [--at HH:MM] [--tz <IANA zone>]
```

- **What it creates:** Ana and Radu, paired, with Maia (13 weeks), three weeks of
  feeds, sleeps and diapers in the phones' time zone (Europe/Bucharest unless `--tz`),
  night feeds split about 60/40, and check-ins for the three days before. Today's
  check-in is left open for the reveal. It seeds no chat.
- **`--at`** is the recording time today, at most 30 min after the run (default: now).
  - The last nap is placed so that, at that time, **Next up** shows the nap window
    15–45 min ahead and tonight's bedtime routine still to come. Early in the day,
    today's wake-up time is placed instead, before any nap. Today's wake stays between
    05:50 and 08:25.
  - The script prints the take's expected card, for example
    `Next up at 10:00 (Europe/Bucharest): nap 10:35–11:05, routine starts 18:35 tonight, …`.
    Check the phones against it before recording.
- **When it works:** about 06:50–18:35 in the seed's zone.
  - At 13 weeks bedtime is a clock time (the routine starts 18:30–20:00), and naps
    only start during the day, so no history can make a nap window show at night.
  - At night the script refuses. It prints the valid range and suggests a `--tz` where
    it is daytime, for example `America/Los_Angeles` at 03:00 in Bucharest.
  - **With `--tz`, set both phones (or the emulator) to that time zone before the take.**
    The card uses the phone's zone, so otherwise it won't match the printed windows.
  - The range is computed with the prediction engine (`validAnchorRange`), not
    hard-coded.
- **Reset:** it deletes and recreates only families whose every member is a demo
  account; if a demo account shares a family with anyone else, it changes nothing.
  It also clears the demo accounts' rate-limit counters.
- **Guards:**
  - `--project` must match `SUPABASE_URL` (`local` for the local stack).
  - It prints names, counts and times, never keys, passwords or emails.
- **Tests:**
  - `scripts/seed-demo/plan.test.ts`: the timeline at every 15 min of the range, an
    early take with no nap yet, `--tz` at night, DST in Bucharest and Los Angeles, and
    the guards.
  - `scripts/seed-demo/seed.test.ts`, on the local stack: two runs give the same state;
    another family is untouched; the night refusal suggests a `--tz` that then works;
    the printed card.

| # | Time | Phone | What happens | What it shows |
|---|---|---|---|---|
| 1 | 0:00–0:15 | — | The problem: new parents juggle tracking, guesswork about sleep, and each other. | Why the app exists |
| 2 | 0:15–0:45 | Mom | Holds the mic: "she drank 90 ml twenty minutes ago, she's asleep now". Two confirm cards appear, a feed and a sleep; she taps Confirm. **Dad's phone updates instantly.** | Muse Voice Transcribe → Muse Spark agent → proposals; nothing is saved until Confirm; realtime sync |
| 3 | 0:45–1:05 | Either | The **Next up** card shows the next nap window and when the bedtime routine starts, with its reminder. | Predictions computed by code from the log; local reminders |
| 4 | 1:05–1:30 | Dad | Asks the chat: "why is she so fussy tonight?". The answer draws on her last naps and feeds. | The agent reads the log (`get_recent_events`, `get_next_windows`); a family-life companion |
| 5 | 1:30–1:50 | Either | "she has a fever of 38.5" returns the **escalation card**, not advice. | Not a medical app: keywords plus a classifier; static card; no model text |
| 6 | 1:50–2:20 | Both | **Check-in:** both answer; the answers reveal; the **night-feed balance** shows who carried more this week. | Couple layer; revealed only once both answered; never sent to the AI |
| 7 | 2:20–2:35 | Both | Dad's **private thread** doesn't exist on Mom's phone. | Private threads readable only by their owner (RLS) |
| 8 | 2:35–2:55 | Laptop | The repo: RLS policies, tests passing in CI, keys server-side, the APK in Releases. | Production-grade security and tests |

## Notes for the recording

- **Step 2:** say the phrase clearly, under 30 s. The cards take about 5 s; keep talking
  over the wait.
- **Step 5:** the card text comes from the app, not the model. Point at it and say so.
- **Step 7:** show the Shared / Private switch on both phones.
- **Step 8:** keep it to a few seconds per item:
  - `supabase/migrations/` (RLS from the first migration);
  - the green CI run;
  - `SECURITY.md`;
  - the release with the APK.
