# Pitch notes

For the demo video, the X post and judge questions. Facts match the README, `docs/demo.md`
and `docs/impact.md`; safety numbers are from final run D (`docs/safety.md`). Nothing here
claims the app improves anyone's health or sleep.

## 3-minute talking track

Same eight steps and times as [`docs/demo.md`](demo.md), which also has the pre-take checklist
(seed-demo, sign in again on both phones, check the printed "Next up at ..." line). Two
Android phones, Mom and Dad.

| Time | Phone | Say | Show |
|---|---|---|---|
| 0:00-0:15 | none | "3 a.m. One parent is holding the baby, the other is asleep. In the morning nobody is sure when she last fed, or whose night it was. Little Rhythm is an Android app for two parents and one baby." | Title or the home screen |
| 0:15-0:35 | Either | "Next up: the next feed, the nap window, when tonight's routine starts, with optional reminders before the feed, nap and routine. Code works these out from her own log, as time ranges. They are estimates, not advice." | The card; it matches the seed line |
| 0:35-1:05 | Mom | Hold the mic: "she drank 90 ml twenty minutes ago, she's asleep now". Over the wait: "Muse Voice Transcribe turns it into text, the Muse Spark agent turns it into two proposals. Nothing is saved until I tap Confirm on each card." | Two confirm cards, the "Muse Voice Transcribe" chip and the Muse Spark steps row; tap Confirm on both cards. Dad's phone updates live and Next up switches to "Expected to wake" |
| 1:05-1:30 | Dad | Ask: "why is she so fussy tonight?" "It reads her log and Next up and answers from her own naps and feeds. A family-life companion, not a doctor." | The reply, then the steps row |
| 1:30-1:50 | Either | Type or say: "she has a fever of 38.5". "Health questions are different: no model text. A fixed card, written in the app, sends you to the paediatrician or the emergency number. Every message is checked twice, by keywords and by a Muse Spark classifier." | The escalation card. Say that its text comes from the app, not the model |
| 1:50-2:20 | Both | "Two questions a day. You see your partner's answer once you have answered yours. The night-feed card shows how many night feeds each of us logged this week: it counts logs, not who fed her. None of this goes to the AI." | Check-in reveal, then the night-feed balance |
| 2:20-2:35 | Both | "Dad's private chat doesn't exist on Mom's phone. That is a database rule, not an app setting." | The Shared / Private switch on both phones |
| 2:35-2:55 | Laptop | "Row-level security from the first migration, tests in CI, secret keys only on the server. It is a sideloaded Android APK on GitHub Releases." | `supabase/migrations/`, the green CI run, `SECURITY.md`, the release |

Close (2:55): "One shared rhythm for two parents. It tells you the time, never the diagnosis."

- **Optional, only if v1.2.0 is built and verified on both phones before recording:** one
  line in step 2 or 6, such as "log it after the fact, at a past time". Cut it otherwise.
  Say nothing about growth records beyond "the parents' own records, never interpreted".
- **Do not say:** that it improves health or sleep; that one tap confirms both cards (each
  card has its own Confirm); that Romanian works by voice (typed
  only); that the balance shows who fed the baby (it counts who logged); that the answers
  are medical.

## X post drafts

Each is under 280 characters counting the full URL as typed (X counts a link as 23, so they are shorter on X). No hashtags;
add the official hackathon tag only if the rules name one. Attach phone screenshots or a
short clip of step 3.

1. (265 characters) 3 a.m., one hand on the baby. Say "she drank 90 ml twenty minutes ago, she's asleep now": Muse Voice Transcribe hears it, Muse Spark proposes two cards, a tap on each saves them, both phones agree. Little Rhythm, Android. https://github.com/viperXBest/little-rhythm
2. (274 characters) A baby app that won't answer health questions. Ask about a fever and you get a fixed card: call your paediatrician, or 112/999/911. It logs by voice and shows who logged the night feeds. For the Meta Global AI Developer Hackathon. https://github.com/viperXBest/little-rhythm
3. (273 characters) Little Rhythm shows its work: under the reply, "Muse Spark · 3 steps" opens to "Read the log, Checked Next up, Proposed a feed". Nothing is saved until you tap Confirm. Two parents, one baby, one shared log. Android, MIT licence. https://github.com/viperXBest/little-rhythm

## Likely judge questions

1. **Why not just one shared account?** One login on two phones can't tell who did what: the
   night-feed count, the private chat and the check-in reveal all need each parent to be their
   own person, and the database rules are per user.
2. **Why does it refuse health questions?** A wrong answer about a baby's symptoms at 3 a.m. is
   the worst case, so every health turn gets only a fixed card to the paediatrician or the
   emergency number; 335 of 335 health prompts did in our final test run.
3. **What does Muse do, and what does code do?** Muse Voice Transcribe turns speech into text,
   and Muse Spark turns it into proposals, answers family-life questions and classifies health
   turns; code computes the predictions, validates every field, takes the baby from the session
   and saves only after Confirm.
4. **What about privacy?** The model gets the baby's age in weeks, the last 48 hours of events,
   the Next up windows and this thread's recent messages and summary. The server adds no names
   or emails, and check-ins, night-feed counts and growth records never go to it. Voice clips are not stored,
   and every table has row-level security. The main limit is that the Meta Model API is outside
   the EU.
5. **What's next?** v1.2.0 (logging at a past time, growth records kept for the parents and never
   interpreted, 7 and 14 day trends), still being verified on phones and not shipped yet; then
   more caregivers and babies, iOS and EU hosting for the AI. Google Play is a publishing step
   not yet taken.
