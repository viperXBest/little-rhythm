# Little Rhythm v1.1.1

Android APK, sideloaded. Built for the Meta Global AI Developer Hackathon (Indie
Developer track). This release makes the Muse Spark agent visible in the app, and
tightens safety for a parent in crisis.

## Download

| File | Version | SHA-256 |
|---|---|---|
| `little-rhythm-1.1.1.apk` | 1.1.1 (versionCode 6) | `7a02370d583a9260a601a5a009baca0dbd39d028495fb91c02c97fef0d4bdfba` |

- Built by EAS (build `4ea4c5f9-48e6-4d36-8e85-3d7531ba5a3e`, production profile) from
  `5e9175b`. The `app/` folder is identical at the `v1.1.1` tag.
- **Installing over v1.0.0 or a local build:** uninstall the old app first, because the
  signature differs. Updating from the v1.1.0 APK works without uninstalling.
- Check the file: `sha256sum little-rhythm-1.1.1.apk` (Windows:
  `certutil -hashfile little-rhythm-1.1.1.apk SHA256`).

## What's new

**Muse Spark in plain view**
- **Agent steps:** under each live reply, a "Muse Spark · N steps" row opens to show
  what the agent did, such as "Read the log", "Checked Next up" or "Proposed a feed".
  The server builds these labels from the tools that ran, never from model text.
- **Named models:** voice transcripts carry a "Muse Voice Transcribe" chip. The
  thinking state reads "Muse Spark is thinking…", and every confirm card says "Proposed
  by Muse Spark · confirm to save".

**Safety**
- **Parent in crisis:** words about self-harm, scary thoughts, fear of hurting the baby,
  not coping or needing help right now, in English and Romanian, make an escalated turn
  urgent (the Call button). They never escalate a turn on their own.
- **Safe sleep:** the agent never suggests a parent rest or nap while the baby sleeps
  on them or in their bed.
- **No age-norm claims:** the agent no longer says what is "normal" or "typical" for her
  age. Windows from the age bands are called "the app's starting schedule".
- **Local emergency number:** the escalation card shows 911 in the US and Canada, 999 in
  the UK and 112 everywhere else, picked from the phone's time zone.

**Next up**
- Calmer copy: "past the usual window" instead of "overdue", and "Estimates from your
  log, not advice".

**Server (`chat` v10, already live)**
- Accounts in their first hour get 10 chat turns that day; after the first hour the
  normal 60 a day applies.
- The global daily spend budget is set by a secret (`CHAT_GLOBAL_DAILY_USD`, $10 by
  default), so it can change without a redeploy.
- Migration `20261103090000_chat_new_account_cap.sql`.

**Fixes**
- Two stale code comments corrected (the health gate fails closed; the classifier
  timeout is 30 s).

## Safety results (final run D, `38a81e7` = hosted `chat` v10)

| Health escalated | Urgent agreement | Non-health false positives | Over-triage | Jailbreak declined | Errors |
|---|---|---|---|---|---|
| 335/335 | 92/92 | 2/157 | 11/243 | 17/17 | 0 |

- Muse Spark Open graded the 189 replies a parent saw: 0 health advice, 15 borderline.
- v1.1.1 took three runs to meet the baseline, and every attempt is recorded. Details in
  [`docs/safety.md`](safety.md).

## Known limits

- **Demo-tier hosting:** sign-up is open, with no captcha or email confirmation. Many
  throwaway accounts could pause chat for everyone until the next UTC day; logging,
  sync and Next up keep working. Runbook in [`docs/security.md`](security.md).
- **Voice is English-first:** Romanian isn't one of Muse Voice Transcribe's languages,
  but Romanian works when typed.
- **One baby, two parents, Android only.**
- **AI processing:** chat content goes to Meta's US-hosted Model API. Only age in weeks
  and recent events are sent, never names or emails.

**Not medical advice.** Health questions get only a static card pointing to the
paediatrician or the emergency number.
