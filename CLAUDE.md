# Little Rhythm — project spec

## Handoff (Nov 3, 11:45 Bucharest)

**State**
- **Release:** v1.1.1 is the current release.
  - Tag `v1.1.1` is on `e649c88` (main: the v1.1.1 merge `cd74c02` plus the release docs).
  - `v1.1.0` is on `ba15979`.
  - Both tags and main are pushed. CI ran green locally on the merge, on all four jobs.
- **Shipped equals the tag:**
  - `git diff 5e9175b v1.1.1 -- app/` is empty (the APK's build commit).
  - `git diff 38a81e7 v1.1.1 -- supabase/functions` is empty (hosted `chat` v10).
  - The last migration is `20261103090000`, local and hosted.
- **Hosted functions:**

  | Function | Version | Source | Note |
  |---|---|---|---|
  | `chat` | v10 | `38a81e7` | deployed 3 Nov 08:49 UTC; smoke-tested (normal turn, demo line → 2 cards with steps, fever → card only) |
  | `predict` | v4 | `491b761` | runtime-identical to v1.1.1 (only a tool-description string and a comment changed in its import graph) |
  | `pair` | v4 | `3191717` | import graph identical to v1.1.1 |
  | `delete-account` | v2 | `3191717` | import graph identical to v1.1.1 |

  - No secrets were set: `CHAT_GLOBAL_DAILY_USD` is unset, so the budget is $10.
  - The table is in `docs/security.md`, "Deployed versions".
- **APK:** EAS build `4ea4c5f9-48e6-4d36-8e85-3d7531ba5a3e`, app 1.1.1, versionCode 6, from `5e9175b`.
  - SHA-256 `7a02370d583a9260a601a5a009baca0dbd39d028495fb91c02c97fef0d4bdfba`.
  - The release folder is `%LOCALAPPDATA%\lr-release\v1.1.1\`: `little-rhythm-1.1.1.apk` and `release-notes-v1.1.1.md` (also in `docs/`).
- **Safety:** the final run D (`38a81e7`) is the v1.1.1 result (`docs/safety.md`).
  - Results: health 335/335, urgent 92/92, non-health false positives 2/157, jailbreak 17/17, 0 errors, 0 rate-limited.
  - Replies: 0 advice, 15 borderline.
- **This PC:**
  - The local Supabase stack is stopped. No background shells are running.
  - `docs/judge-2026-11-02/` is gitignored (local judge reviews).
  - The old worktrees under `.claude/worktrees/` (`agent-a16ca2c3dc2a40dcb` = branch `v1.1.1`, `urgent-override`) can be removed once nothing needs them.

**Scope freeze**
- No new features. Code changes only for a bug found in the open items.
- Any change to `supabase/functions` needs a full safety run that meets the baseline (health 100%, urgent 92/92, non-health false positives ≤ 2/157, jailbreak 17/17, 0 errors), the owner's OK, a redeploy and a new tag.
- Any change to `app/` needs a new EAS build (avoid: the deadline is Nov 4).

**Open items**
1. **GitHub Release v1.1.1:** published by hand in the browser, with the tag, the notes and the APK from the release folder. Check that it is published.
2. **Phone check of v1.1.1** on both phones:
   - the steps row, the Muse Voice Transcribe chip, the confirm-card footer and the Next up copy;
   - the escalation card number (112 in Bucharest, 999 in London);
   - real voice, the launcher icon, the splash and the notification icon.
3. **Seed-demo thread check:** seed-demo never touches `chat_threads` or `chat_messages`, so old chats survive a re-seed.
   - Ana's private thread has the 3 Nov smoke-test turns: night-feed split, the demo line, and "she has a fever of 38.5" with the card.
   - Decide before recording whether the demo threads should start empty. If so, clear them once, by hand or with a seed option, after the owner's OK. Don't print or log chat content.
4. **Judge run 3:** 3 fresh Claude judges plus `scripts/review/review.ts` (Muse Spark Open), with the same prompts as run 2 (`docs/judge-2026-11-02/run2/`). Save to `docs/judge-2026-11-03/run3/` (gitignore it too) and compare with `plan-9.5.md`.
5. **Parent test** (`docs/user-test-2026-11-03.md`): the owner runs it; write it up with no personal data.
6. Nov 4: the demo video, slides, X post, and submit in the evening.

**Working rules**
- Ask before: git push, pushing tags, `db push`, `secrets set`, `functions deploy`.
  - `db push`: dry run first, show it, never `--include-all`, pass `--linked`.
  - The auto-mode classifier blocks hosted pushes and deploys: give the owner the exact `! cd /c/... && npx -y supabase@2.122.0 ...` command (bash paths with forward slashes).
- Supabase CLI: always `npx -y supabase@2.122.0`. Deno: `npx -y deno@2`, `deno fmt --line-width 110`.
- Never point the safety runner at hosted.
  - It runs on the local stack only, and resets the local global breaker row itself.
  - Run D costs about $4.5.
- No medical advice anywhere; the escalation card stays static and serious.
- Never commit `.env` files, keys, keystores or real personal data.
- Commits end with the Co-Authored-By line. A branch and a tag are both named `v1.1.1`: push the tag as `refs/tags/v1.1.1`.
- If the global breaker pauses chat during judging: runbook in `docs/security.md` ("Runbook: chat paused by the global breaker"), or raise the budget with `CHAT_GLOBAL_DAILY_USD` (`secrets set`, ask first).

Android app (sideloaded APK) where two parents share one baby, log by tap, chat or voice, see the next feed, nap and bedtime windows, and coordinate with each other. Built for the Meta Global AI Developer Hackathon (Indie Developer track). Code and security are production-grade; only hosting is demo-tier.

- App name: Little Rhythm · Android package: `com.viperxbest.littlerhythm` · Expo slug: `little-rhythm`
- **Deadline: Nov 4, 9 PM ET (Nov 5, 04:00 Bucharest).** Submit on the evening of Nov 4.
- Public repo: every commit is visible. Small commits per feature, pushed at the end of each session. Only work built during the event (from Oct 27) may be shown.

## Hackathon rules that constrain the code

- **No medical advice.** AI that gives medical advice is a listed anti-project and gets disqualified. The buddy never gives health, medical or medication advice. Any health question returns only an escalation card (call the paediatrician or 112). Not a mental-health or relationship counsellor either.
- **Use of Meta AI tooling is 25% of the score.** Muse Spark 1.3 runs as a tool-calling agent; Muse Voice Transcribe handles voice. Make both visible in the demo and README.
- Bonus prizes in reach: Best Agentic Use-Case, Most Viral on X, Community Vote.

## Stack

- **App** (`/app`): Expo (React Native, TypeScript, strict), Expo Router, development build. Libraries: supabase-js, expo-secure-store, @siteed/audio-studio (voice recording), expo-notifications, expo-dev-client.
- **Backend** (`/supabase`): Supabase, EU region (Frankfurt). Postgres with RLS, Auth, Realtime, Edge Functions (Deno, TypeScript).
- **AI**: Meta Model API, base URL `https://api.meta.ai/v1`, auth `Authorization: Bearer $MODEL_API_KEY`.
  - `muse-spark-1.3` via the OpenAI-compatible SDK (Chat Completions, tool calling, structured output). One user message may trigger several tool calls (agent loop).
  - `muse-voice-transcribe-1.0` for voice logs: the app records audio, the `chat` function transcribes it, then runs the same agent.
  - Voice pipeline, no conversion anywhere: @siteed/audio-studio records WAV (16 kHz, mono, PCM16, compressed output off, max 30 s ≈ 0.96 MB) → `chat` function checks size and header (`_shared/voice.ts`) → `POST https://api.meta.ai/v1/asr/transcribe` (multipart: `request` JSON with `audioEncoding: "WAV"`, `audio` file) → agent. The endpoint accepts only WAV (mono PCM16, 16 or 24 kHz); m4a/AAC is rejected. expo-audio was removed (Android records compressed formats only).
  - Called **only** from Edge Functions. Key in Edge Function secrets as `MODEL_API_KEY`. Do not use `-contributor` model variants.
- **Predictions**: one TypeScript module in `supabase/functions/_shared/`, unit-tested. The app gets results only from the `predict` function, so the card and the chat always agree. Predictions are computed on request, never stored.

## Repo layout

```
/app                 Expo app (TypeScript)
/supabase
  /migrations        schema + RLS policies
  /functions         chat, predict, pair, delete-account, _shared
  /tests             RLS tests (pgTAP); realtime and function tests (Deno, local stack)
/scripts             seed-demo (runs locally only)
/docs                architecture, security, demo script
README.md  SECURITY.md  LICENSE  .env.example
```

## Features in scope (everything else is roadmap — do not build it)

| # | Feature | What it does |
|---|---|---|
| F1 | Family and pairing | Sign up, create the baby, invite the partner with a one-time code; both phones see the same baby |
| F2 | Tracking | One-tap feed (bottle in ml, or breast side and duration), sleep start/stop, diaper (wet/dirty); edit, delete, timeline; real-time sync |
| F3 | Agentic chat and voice logging | "She drank 90 ml at 3, she's asleep now" (typed or spoken) → Muse Voice Transcribe → Muse Spark agent creates the feed and the sleep, shown as confirm cards before saving |
| F4 | Predictions | Next feed, next nap, bedtime-routine start and bedtime as time ranges, computed by code; Muse only explains them |
| F5 | Family-life companion | Warm chat about family life (non-health baby care, the log and rhythm, logistics, the couple, self-care) with per-thread memory (30 messages, rolling summary, search); never gives health advice; any health question returns only an escalation card |
| F6 | Couple layer | Daily 2-question check-in revealed once both answered; night-feed balance; private and shared chats |
| F7 | Notifications | Local reminders before predicted windows and for the daily check-in |
| F8 | Account deletion | Deletes the user, and the family's data when they are the last member |

Roadmap only: an output keyword check on model replies (tried in v1.1.1, removed after safety run D), dropping the 5-argument `consume_chat_budget` wrapper (kept for `chat` v9), relationship nudges, pumping, growth charts, medication tracking, tips library, more caregivers and babies, iOS, WhatsApp logging, EU hosting for the AI.

## Agent tools (chat function)

`log_feed`, `log_sleep`, `end_sleep`, `log_diaper`, `get_recent_events`, `get_next_windows` (the same engine as `predict`, bound to the session baby, no arguments read), `search_chat_history` (bound to the session thread, RLS RPC, gated and escalation rows excluded). Write tools return proposals that the app shows as confirm cards; nothing is saved until the user confirms. `end_sleep` closes the open sleep the server finds, never one the model names. Muse Spark runs with `reasoning_effort: "low"` (measured faster and as accurate, see `docs/chat.md`). Chat feed ranges match the app: bottle 5–400 ml, breast 1–90 min. Write tools take `time_stated`; the server sets `time_assumed` (no time given, or "now" with no time words / a garbled transcript) and adds the fixed note "Time not mentioned, set to now. Edit if wrong."; a garbled transcript makes the agent ask again (`_shared/unclear-input.ts`, regression set `chat/safety-unclear.json`). Transcription sends `languageBias` from the app's `lang` (unsupported, e.g. Romanian, or missing → English); no keywords, never the baby's name.

Each turn also gets a server-built context (age in weeks, last 48 h of events, the computed windows, the thread's last 10 messages minus escalated turns) and passes the health gate: `_shared/health-keywords.ts` (EN/RO) plus a Muse Spark structured-output classifier run in parallel with the agent. Either positive → `escalation`, no model text; the card text is static in the app. Requests carry `thread_id`; the function checks the thread is the caller's before storing anything. See `docs/chat.md` and `docs/safety.md`.

Memory (Day 6b): the last 30 usable messages verbatim; a rolling summary in `thread_memory` folded after the response (`_shared/thread-memory.ts`), checked for health keywords, emails, ids and names before storage; search through `search_thread_messages` (SECURITY INVOKER, unaccented `simple` FTS). The parent's message is stored after the gate; gated turns are inserted with `gated = true` by the function and never reused.

## Data model

Twelve tables, all with RLS. Every row hangs off a family; one helper, `is_family_member(family_id)`, protects all of it.

| Table | Key columns |
|---|---|
| profiles | id (= auth user), display_name |
| families | id, created_by |
| family_members | family_id, user_id, role |
| babies | id, family_id, name, birth_date |
| events | id, baby_id, type (feed/sleep/diaper), started_at, ended_at, details (jsonb), created_by, source (tap/chat/voice) |
| invites | family_id, code_hash, expires_at, used_at, created_by |
| chat_threads | id, family_id, owner_id (set = private) |
| chat_messages | thread_id, role, content (null on escalation), escalation, proposal_summary, gated, author_id, created_at, search (tsvector) |
| checkins | family_id, user_id, day, answers (jsonb) |
| api_usage | user_id, function, window_start, count |
| thread_memory | thread_id (PK), summary (<= 4000), covered_until, updated_at |
| usage_counters | scope (family/global), family_id, function, window_start, count (family chat turns; global chat spend in micro-USD; service-role writes only) |

## Security rules (non-negotiable)

- RLS on every table from its first migration. No table without policies.
- Private threads readable only by `owner_id`. Partner's check-in answers readable only after you answered the same day.
- Pairing: random 8-character code, stored hashed, single use, expires in 24 h, attempts rate-limited.
- AI tool calls: `baby_id` and `family_id` come from the session, **never** from the model. Validate all tool arguments with zod (ranges for ml, minutes, timestamps).
- Edge Functions use zod >= 4.6.6; every array schema has .max(), every string .max().
- Buddy: no medical advice, no diagnosis, no medication doses. Health questions → escalation card only.
- Only age in weeks and recent events go to the AI. No names, no emails. Voice clips are transcribed and not stored. No chat content, audio or tokens in logs.
- Session tokens in expo-secure-store, never AsyncStorage.
- The APK contains only the public Supabase URL and anon key. EAS builds get them from the EAS `production` environment (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`; `app/.env` is not uploaded). `app/app.config.ts` fails any build or expo command when either is missing or the key isn't anon/publishable, and requires `https://<ref>.supabase.co` for the production profile. The production profile builds an APK, and `requireCommit` is on. Never commit: `.env` files, the service_role key, `MODEL_API_KEY`, keystores, real personal data.
- Account deletion re-checks the password server-side. A stolen session can't change the password first: hosted Auth has "Require current password when updating" on (hosted-only; CLI v2.122.0 has no config.toml key, so local and CI don't cover it) and secure password change (also in config.toml). Verified on hosted; see docs/security.md.
- Per-user rate limits on `chat`, `pair` and `predict` via `api_usage`. Chat caps (v1.1.0): 60/h and 60/day per user, 100/day per family, and a global $10/day spend breaker (reserve the worst case, settle to metered usage; assumed prices in `_shared/chat-limits.ts`). All return `429 rate_limited` before any model call. Every Muse Spark call sends `max_completion_tokens` 4096 (reasoning counts); a `length` finish runs no tool calls and a cut-off classifier fails closed. The classifier times out at 30 s, like the agent.
- Prediction reminders use the fixed ids `predict-feed`, `predict-nap` and `predict-routine`; the check-in reminder uses `checkin-daily`. Each sync cancels only its own ids. Never call `cancelAllScheduledNotificationsAsync`.
- Couple data (check-ins, night-feed balance) never goes to the AI.
- Every security control gets a test (pgTAP for RLS, function tests for pair/chat).

## Design (v1.1.0: Cloud Lullaby)

The v1.1.0 redesign is UI-only: no change to data, RLS, Edge Functions, security, behaviour or copy (v1.1.0 also ships the separate server track: `chat` v9, see the Day 10 plan entry). Direction C, **Cloud Lullaby** (picked Nov 2): periwinkle and indigo on lilac-white, night-sky navy dark mode, "sticker" cards (2 px outline, hard 4 px shelf, no blur), duotone icons, mascot **Fluff** (a cloud-sheep). Spec and mockups: `docs/design/directions/c-cloud-lullaby/`; every decision: `docs/design/decisions.md`; audit: `docs/design/audit.md`.

- **Changes to C:** in dark mode the quick-log buttons and the parent's chat bubbles are a tinted dark surface with a lavender border and icon (full lavender fill only for Confirm and the active segment). Body font Nunito (Atkinson's slashed zero misreads "21:00"); Baloo 2 for headings and big times; both OFL 1.1, licences in `app/assets/fonts/`. Next up is 2×2 and highlights the tile with the earliest start. Home scroll bottom padding = Chat button height + spacing.
- **Tokens:** all colours live in `app/src/constants/palette.ts` (the existing 16 names plus `card`, `feed`, `feedSoft`, `sleep`, `sleepSoft`, `diaper`, `diaperSoft`); components read them through `useTheme()`, never as literals. `palette.test.ts` (Deno, CI) checks WCAG AA for every pair the app uses: text ≥ 4.5:1; large text, focus rings, accents, icons, UI boundaries and the escalation border ≥ 3:1. No Meta logo, wordmark or infinity gradient.
- **Escalation card stays serious:** `warningBackground` fill, `error` border, ⚠, red "Call 112", exact text, no mascot or playful styling (fonts and radius only).
- **Illustrations** are react-native-svg components with fills from theme tokens: one file per asset, no light/dark copies. ESLint bans `SvgUri`, `SvgCssUri`, `SvgFromUri`, `LocalSvg` and remote `href`s.
- **Accessibility:** 48 dp targets, text scales to 200% without clipping, labels and roles on every control. Every screen has empty, loading and error states.
- Inspiration only: nothing copied from Huckleberry or any other app.

## Conventions

- TypeScript strict everywhere; no `any`.
- Database changes only through migrations in `/supabase/migrations`.
  - A new migration's timestamp must be later than the latest one (currently `20261102120000`).
  - Until 2026-10-29 10:00 UTC, `supabase migration new` would generate an earlier timestamp: name the file manually with a later one.
  - Never use `supabase db push --include-all`.
- Any change to native modules needs a new EAS build (quota: 15 Android builds/month on free). Prefer JS-only changes. Day 3 build added expo-audio, @react-native-community/datetimepicker and expo-crypto; expo-speech-recognition removed. Day 4 build swapped expo-audio for @siteed/audio-studio (plugin: device detection, background audio, notifications and phone-state handling all off; only RECORD_AUDIO). Rebuild only when a native module changes. Day 8 changed native config without a new module: the expo-notifications plugin (`app/assets/images/notification-icon.png`), the splash background and the adaptive-icon background. Since v1.1.0 all three colours are `#5146B8` and every icon PNG is rendered by `scripts/assets/render.ts` from `app/assets/source/` (it replaced `notification-icon.ts`). It needs a new build, and the icon must be checked on a release APK. Day 10 (v1.1.0) added react-native-svg 15.16.0 (`0124ed8`), before the first local dev-client build.
- **Local Android builds (this PC, Day 10):** JDK 17 in `%LOCALAPPDATA%\Programs\jdk-17.0.20.1+1`, SDK in `%LOCALAPPDATA%\Android\Sdk`, emulator AVD `pixel8` (Android 16, x86_64, WHPX). `app/android/local.properties` (gitignored) sets `cmake.dir` to SDK CMake 3.31.6: its ninja 1.12.1 handles paths over 260 chars, the default CMake 3.22.1 fails. `~/.gradle/gradle.properties` caps Gradle at 1 worker and 1.5 GB heap (an earlier build was killed for low memory). Build with `./gradlew app:assembleDebug` or `app:assembleRelease` and `-PreactNativeArchitectures=x86_64` (emulator) or `arm64-v8a` (phones). Checkpoint reviews use a local release APK, debug-signed, `adb install`ed on phone 2 over USB (uninstall first if the signature differs); no EAS build before Nov 3. Screenshots come from the release APK: the dev client's menu, Tools button and navigation warning get in the way.
- Deno is not installed globally: run it as `npx -y deno@2 ...` (2.9.6 in use). Format with `deno fmt --line-width 110`. App files named `*.test.ts` run under Deno and are excluded from the app's tsc and eslint. Commands: `docs/predictions.md` ("Running the tests").
- **Supabase CLI pinned to 2.122.0** (same as CI's `supabase/setup-cli` `version: 2.122.0`): run every command as `npx -y supabase@2.122.0 ...`, never bare `npx supabase`. On Nov 2 npx resolved bare `supabase` to 3.0.0, whose new `supabase.exe` Defender ASR's prevalence rule blocks on this PC ("Access is denied" / spawn EPERM); 2.122.0 has enough reputation. Don't change Defender or the npx cache.
- CI (GitHub Actions) on every push: typecheck + lint, prediction unit tests, RLS tests against local Supabase, gitleaks.

## Day plan

1. Oct 27–28 · Setup (done): Muse test call, repo, Supabase, Expo scaffold, dev build, this file
2. Oct 28 · Auth, schema, all RLS, pairing, RLS tests (done)
3. Oct 29 · Tracking and real-time sync; add expo-audio and rebuild (done)
4. Oct 30 · Agentic chat and voice logging (Muse Spark + Muse Voice Transcribe, confirm cards) (done; see `docs/chat.md`)
5. Oct 31 · Predictions engine, predict function, "Next up" card, notifications (done, deployed, verified on both phones; see `docs/predictions.md`)
6. Nov 1 · Buddy (no health advice, escalation card), private/shared threads, check-in, night-feed balance (done, deployed, verified on both phones; safety set awaiting generation and curation; see `docs/chat.md`, `docs/couple.md`, `docs/safety.md`)
7. Nov 2 · delete-account (must cascade the family's chat threads, so `thread_memory` goes too), rate limits, security review, safety prompts, CI green
8. Nov 3 · Polish, seed-demo, README, rehearse
   - Add the expo-notifications plugin to app.json: a monochrome (white on transparent) 96×96 notification icon and `#0064E0` (theme `primary`), so the Day 9 release build includes it. Verify on the release APK before recording the demo.
9. Nov 4 · Release v1.0.0, 3-min demo video, X post, submit in the evening
   - **seed-demo works ~06:50–18:35 local.** The nap window opens 15–45 min ahead and tonight's routine is still to come (the 2 h routine cap is gone). Today's wake moves within 05:50–08:25 to fit. Nights can't work in one zone: at 13 weeks bedtime is a clock time, and naps only start in the day. `--tz <IANA>` seeds in a zone where it is daytime; the night refusal suggests one. **With `--tz`, set both phones or the emulator to that zone.** The seed prints the take's expected Next up card. The demo line is relative: "she drank 90 ml twenty minutes ago, she's asleep now".
   - **Confirm card (app-only):**
     - Time fields take the page colour on the card, with an outline and a "Change ›" link.
     - Next to its cards, a reply hides the proposal line and the server's assumed-time note (`app/src/lib/chat-display.ts`). The server still appends the note for older app versions.
     - The new pure helpers have Deno tests in CI: `chat-display`, `mic-label`, `asLanguageTag`.
   - **Device checks** run on the release APK on both phones: Next up after seeding, the card, the demo line, the mic warm-up, the notification icon and the splash. This PC has no Android SDK or emulator.
   - **Safety:** no rerun for v1.0.0. The Oct 30 report (`2fb02cc`, `functions_dirty: false`) stands, because `supabase/functions` is unchanged since. If any commit before the tag touches `supabase/functions`, rerun the full set and redeploy.
   - **Deploys:** `pair` v4, `predict` v3 and `delete-account` v2 were redeployed from `3191717` so hosted equals the release commit. `chat` stays v8. Table in `docs/security.md`, "Deployed versions".
   - **Demo order:**
     - Step 2 shows Next up as seeded (nap window, routine).
     - Step 3 is the voice log; afterwards Next up switches to "Expected to wake".
   - **Release:**
     - Build `3c12fe52-5dd8-46aa-9409-79b7734763b1` from `d4dcdf0` (APK SHA-256 `63f232d8…2e93dab`).
     - Tag `v1.0.0` goes on `d4dcdf0` after the APK is confirmed on both phones; ask before pushing it.
     - No `gh` on this PC: the APK and `release-notes.md` go in a local folder, and the user creates the GitHub Release by hand.
   - **versionCode** is EAS-remote (`appVersionSource: remote`, `autoIncrement`). It was 3, so the v1.0.0 production build gets 4. `app.json` stays 1.0.0.

10. Nov 2–3 · **v1.1.0: design overhaul** (UI only) plus a server track (daily chat caps per user and per family, a global circuit breaker under about $10/day, `max_tokens`, a "never reveal tools" prompt rule, 20 jailbreak prompts in the safety set; see `docs/security-review-2026-11-02.md`). Design freeze **Nov 3, 18:00**; v1.1.0 EAS build Nov 3 evening. The server track ships only if the full safety rerun meets the baseline, and `chat` is redeployed only after the owner approves. Not in v1.1.0: database checks on feed values, a server output filter, captcha, email confirmation.
   - **Version:** `app.json` and `package.json` are 1.1.0; versionCode stays EAS-remote with autoIncrement (v1.0.0 got 4, so v1.1.0 gets 5). Tag `v1.1.0` on the build commit after the phone checks, and only if hosted `chat` v9 matches its `supabase/functions` (`20242e8`).
   - **Server track ships in v1.1.0.** Runs A and B (2 Nov) missed the baseline on a slow API; a paired control showed v8 missing urgent prompts the same way (71/73 vs 70/72), so the cause was the classifier’s 10 s timeout. With the timeout at 30 s, run C (`20242e8`) got 335/335 health, 92/92 urgent, 1/147 non-health false positives (accepted as noise by the owner: one Romanian log line, classifier-only, failed safe), 17/17 jailbreak, 0 errors (`docs/safety.md`). Hosted: migration `20261102120000` pushed, `chat` v9 from `20242e8`, smoke-tested (normal turn, confirm cards, fever → escalation). `predict` v3 is runtime-identical but its import graph includes `_shared/agent.ts` (type-only), which changed. The `server-track` branch is merged into `main`.
   - **Every seed ends the demo sessions** (it resets the passwords): sign in again on both phones after seeding (`docs/demo.md`). After 18:35 Bucharest seed with `--tz Europe/London` and set the devices to London.
   - **Checkpoint on two emulators** (owner, Nov 2) instead of a phone: Ana on `pixel8`, Radu on `pixel8b`, both with the full Gboard (`hw.keyboard=no`). No Gradle build while both run. Real voice and the hardware feel are checked on the phones with the v1.1.0 EAS build.
   - `npx supabase stop` failed with a spawn EPERM on this PC on Nov 2; stopping the `*_little-rhythm` containers with `docker stop` works and keeps the volume.

Protect in this order if behind: security, pairing and sync, agentic chat logging, predictions. Trim UI polish first.
