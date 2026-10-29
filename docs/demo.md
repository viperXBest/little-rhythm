# Demo script

Under 3 minutes. Two Android phones side by side, signed in as **Mom** and **Dad** on
the same baby.

**Before every rehearsal and the recording:** run `seed-demo` (`scripts/`, local only),
so the log, the windows and the check-in start from the same state each time.

| # | Time | Phone | What happens | What it shows |
|---|---|---|---|---|
| 1 | 0:00–0:15 | — | The problem: new parents juggle tracking, guesswork about sleep, and each other. | Why the app exists |
| 2 | 0:15–0:45 | Mom | Holds the mic: "she drank 90 ml at 3, she's asleep now". Two confirm cards appear, a feed and a sleep; she taps Confirm. **Dad's phone updates instantly.** | Muse Voice Transcribe → Muse Spark agent → proposals; nothing is saved until Confirm; realtime sync |
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
