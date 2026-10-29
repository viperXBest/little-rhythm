# Little Rhythm — project spec

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

Roadmap only: relationship nudges, pumping, growth charts, medication tracking, tips library, more caregivers and babies, iOS, WhatsApp logging, EU hosting for the AI.

## Agent tools (chat function)

`log_feed`, `log_sleep`, `end_sleep`, `log_diaper`, `get_recent_events`, `get_next_windows` (the same engine as `predict`, bound to the session baby, no arguments read), `search_chat_history` (bound to the session thread, RLS RPC, gated and escalation rows excluded). Write tools return proposals that the app shows as confirm cards; nothing is saved until the user confirms. `end_sleep` closes the open sleep the server finds, never one the model names. Muse Spark runs with `reasoning_effort: "low"` (measured faster and as accurate, see `docs/chat.md`). Chat feed ranges match the app: bottle 5–400 ml, breast 1–90 min.

Each turn also gets a server-built context (age in weeks, last 48 h of events, the computed windows, the thread's last 10 messages minus escalated turns) and passes the health gate: `_shared/health-keywords.ts` (EN/RO) plus a Muse Spark structured-output classifier run in parallel with the agent. Either positive → `escalation`, no model text; the card text is static in the app. Requests carry `thread_id`; the function checks the thread is the caller's before storing anything. See `docs/chat.md` and `docs/safety.md`.

Memory (Day 6b): the last 30 usable messages verbatim; a rolling summary in `thread_memory` folded after the response (`_shared/thread-memory.ts`), checked for health keywords, emails, ids and names before storage; search through `search_thread_messages` (SECURITY INVOKER, unaccented `simple` FTS). The parent's message is stored after the gate; gated turns are inserted with `gated = true` by the function and never reused.

## Data model

Eleven tables, all with RLS. Every row hangs off a family; one helper, `is_family_member(family_id)`, protects all of it.

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

## Security rules (non-negotiable)

- RLS on every table from its first migration. No table without policies.
- Private threads readable only by `owner_id`. Partner's check-in answers readable only after you answered the same day.
- Pairing: random 8-character code, stored hashed, single use, expires in 24 h, attempts rate-limited.
- AI tool calls: `baby_id` and `family_id` come from the session, **never** from the model. Validate all tool arguments with zod (ranges for ml, minutes, timestamps).
- Edge Functions use zod >= 4.6.6; every array schema has .max(), every string .max().
- Buddy: no medical advice, no diagnosis, no medication doses. Health questions → escalation card only.
- Only age in weeks and recent events go to the AI. No names, no emails. Voice clips are transcribed and not stored. No chat content, audio or tokens in logs.
- Session tokens in expo-secure-store, never AsyncStorage.
- The APK contains only the public Supabase URL and anon key. Never commit: `.env` files, the service_role key, `MODEL_API_KEY`, keystores, real personal data.
- Account deletion re-checks the password server-side. A stolen session can't change the password first: hosted Auth has "Require current password when updating" on (hosted-only; CLI v2.122.0 has no config.toml key, so local and CI don't cover it) and secure password change (also in config.toml). Verified on hosted; see docs/security.md.
- Per-user rate limits on `chat`, `pair` and `predict` via `api_usage`.
- Prediction reminders use the fixed ids `predict-feed`, `predict-nap` and `predict-routine`; the check-in reminder uses `checkin-daily`. Each sync cancels only its own ids. Never call `cancelAllScheduledNotificationsAsync`.
- Couple data (check-ins, night-feed balance) never goes to the AI.
- Every security control gets a test (pgTAP for RLS, function tests for pair/chat).

## Conventions

- TypeScript strict everywhere; no `any`.
- Database changes only through migrations in `/supabase/migrations`.
  - A new migration's timestamp must be later than the latest one (currently `20261030090000`).
  - Until 2026-10-29 10:00 UTC, `supabase migration new` would generate an earlier timestamp: name the file manually with a later one.
  - Never use `supabase db push --include-all`.
- Any change to native modules needs a new EAS build (quota: 15 Android builds/month on free). Prefer JS-only changes. Day 3 build added expo-audio, @react-native-community/datetimepicker and expo-crypto; expo-speech-recognition removed. Day 4 build swapped expo-audio for @siteed/audio-studio (plugin: device detection, background audio, notifications and phone-state handling all off; only RECORD_AUDIO). Rebuild only when a native module changes.
- Deno is not installed globally: run it as `npx -y deno@2 ...` (2.9.6 in use). Format with `deno fmt --line-width 110`. App files named `*.test.ts` run under Deno and are excluded from the app's tsc and eslint. Commands: `docs/predictions.md` ("Running the tests").
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
   - Add the expo-notifications plugin to app.json: a monochrome (white on transparent) 96×96 notification icon and the brand accent colour (`#208AEF`, theme `primary`), so the Day 9 release build includes it. Verify on the release APK before recording the demo.
9. Nov 4 · Release v1.0.0, 3-min demo video, X post, submit in the evening

Protect in this order if behind: security, pairing and sync, agentic chat logging, predictions. Trim UI polish first.
