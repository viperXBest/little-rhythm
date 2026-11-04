# Little Rhythm v1.2.0

Android APK, sideloaded. Built for the Meta Global AI Developer Hackathon (Indie
Developer track). This release lets a parent log what already happened at its real time,
keeps the baby's growth as a plain record, and shows seven or fourteen days of the log.

## Download

| File | Version | SHA-256 |
|---|---|---|
| `little-rhythm-1.2.0.apk` | 1.2.0 (versionCode <!-- VERSION_CODE -->) | `<!-- APK_SHA256 -->` |

- Built by EAS (build `<!-- EAS_BUILD_ID -->`, production profile).
- **Installing over v1.1.1:** updating from the v1.1.1 EAS APK works without uninstalling.
  Uninstall first if you have v1.0.0 or a local build, because the signature differs.
- Check the file: `sha256sum little-rhythm-1.2.0.apk` (Windows:
  `certutil -hashfile little-rhythm-1.2.0.apk SHA256`).

## What's new

**Manual entry**
- Log a feed, sleep or diaper at a past time ("Earlier…"), and add a past sleep with a
  start and an end.
- The rules are the same when you edit an event: no future times, nothing before the
  baby's birth date, a sleep ends after it starts, and sleeps never overlap. Bottle
  stays 5–400 ml and breast 1–90 min. If the app can't check your other sleeps, it refuses
  the entry instead of saving it unchecked.
- Details: [README](https://github.com/viperXBest/little-rhythm/blob/main/README.md#manual-entry-v120).

**Growth**
- Weight, length and head circumference, each with a plain line chart. Both parents can add,
  edit and delete values.
- Never interpreted: no percentiles, norms or reference lines. The screen says "For your
  records. Your paediatrician interprets growth."
- Never sent to the AI. No Edge Function reads the table, and a CI step fails the build if
  one mentions `growth_measurements`.
- **Needs a database migration** (`20261103140000_growth.sql`, the `growth_measurements`
  table, now the 13th table). It has to be pushed to the hosted project before this build is
  used. Until it is, Growth shows an error state and the rest of the app works.

**Trends**
- A 7 or 14 day view of feeds, bottle ml, time asleep and diapers per day, computed on the
  phone. Sleep is split at local midnight, and clock-change days are handled (tested in
  two zones with DST).
- Counts and totals only, nothing compared or judged. Charts have text summaries, and a
  "Day by day" list gives every number as text for screen readers.

**Fixes from a final debugging pass (OpenAI Codex)**
- **Confirm cards are kept per thread:** the open, saved and discarded state of a reply's
  cards is held for each chat thread, so switching between the shared and a private chat no
  longer mixes them up.
- **A partner's delete or end is handled:** editing an event the other parent just deleted,
  or ending a sleep that was already ended or deleted on the other phone, now reports a
  failure instead of showing success. A failed edit also reloads the day's log.
- **Trends refresh:** the Trends screen refetches after a change to today's log (a partner's
  tap, a chat confirm), so it no longer shows old numbers.

**Safety tooling (no change to the app or to `chat`)**
- A held-out multi-turn runner (`scripts/safety/run-heldout.ts`) with hand-written
  conversations, which sends turns one by one on a single thread against the local stack.
  Method and results are in
  [`docs/safety-runs/`](https://github.com/viperXBest/little-rhythm/blob/main/docs/safety-runs/README.md).

<!-- CLASSIFIER_RELEASE_NOTE -->

## Server

- **`chat` is unchanged since v10**, and so are `predict`, `pair` and `delete-account`. The
  only server change is the growth migration above.
- Safety results therefore stand: final run D (`38a81e7`) got health 335/335, urgent 92/92,
  non-health false positives 2/157, jailbreak 17/17, 0 errors; the replies graded 0 advice
  and 15 borderline
  ([`docs/safety.md`](https://github.com/viperXBest/little-rhythm/blob/main/docs/safety.md)).

## Known limits

- **Demo-tier hosting:** sign-up is open, with no captcha or email confirmation. Many
  throwaway accounts could pause chat for everyone until the next UTC day; logging, sync
  and Next up keep working. Runbook in
  [`docs/security.md`](https://github.com/viperXBest/little-rhythm/blob/main/docs/security.md).
- **Voice is English-first:** Romanian isn't one of Muse Voice Transcribe's languages, but
  Romanian works when typed.
- **One baby, two parents, Android only.**
- **AI processing:** chat content goes to Meta's Model API, which is outside the EU. The full
  list of what is sent, and what never is (names, ids, couple data and growth records), is in
  [`docs/chat.md`](https://github.com/viperXBest/little-rhythm/blob/main/docs/chat.md#what-goes-to-the-ai).
- More in the README's
  [Known limitations](https://github.com/viperXBest/little-rhythm/blob/main/README.md#known-limitations).

**Not medical advice.** Health questions get only a static card pointing to the
paediatrician or the emergency number. Growth and trends are records, never advice.
