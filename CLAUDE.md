# Little Rhythm — project spec

Android app (sideloaded APK) where two parents share one baby, log by tap, chat or voice, see the next feed, nap and bedtime windows, and look after each other. Built in 10 days for a Meta hackathon. Code and security are production-grade; only hosting is demo-tier.

- App name: Little Rhythm · Android package: `com.dragos.littlerhythm` · Expo slug: `little-rhythm`
- Public repo: every commit is visible. Small commits per feature, pushed at the end of each session.

## Stack

- **App** (`/app`): Expo (React Native, TypeScript, strict), Expo Router, development build. Libraries: supabase-js, expo-secure-store, expo-speech-recognition, expo-notifications, expo-dev-client.
- **Backend** (`/supabase`): Supabase, EU region (Frankfurt). Postgres with RLS, Auth, Realtime, Edge Functions (Deno, TypeScript).
- **AI**: Meta Model API, base URL `https://api.meta.ai/v1`, model `muse-spark-1.3`, OpenAI-compatible SDK (Chat Completions with tool calling and structured output). Called **only** from the `chat` Edge Function. Key in Edge Function secrets as `MODEL_API_KEY`.
- **Predictions**: one TypeScript module in `supabase/functions/_shared/`, unit-tested. The app gets results only from the `predict` function, so the card and the chat always agree. Predictions are computed on request, never stored.

## Repo layout

```
/app                 Expo app (TypeScript)
/supabase
  /migrations        schema + RLS policies
  /functions         chat, predict, pair, delete-account, _shared
  /tests             RLS tests (pgTAP)
/scripts             seed-demo (runs locally only)
/docs                architecture, security, demo script
README.md  SECURITY.md  LICENSE  .env.example
```

## Features in scope (everything else is roadmap — do not build it)

| # | Feature | What it does |
|---|---|---|
| F1 | Family and pairing | Sign up, create the baby, invite the partner with a one-time code; both phones see the same baby |
| F2 | Tracking | One-tap feed (bottle in ml, or breast side and duration), sleep start/stop, diaper (wet/dirty); edit, delete, timeline; real-time sync |
| F3 | Chat and voice logging | "She drank 90 ml at 3" becomes an event through Muse tool calling, shown as a confirm card before saving |
| F4 | Predictions | Next feed, next nap, bedtime-routine start and bedtime as time ranges, computed by code; Muse only explains them |
| F5 | Buddy chat | Answers about the baby and parenting using recent data; tips; red-flag symptoms escalate to a doctor |
| F6 | Couple layer | Daily 2-question check-in revealed once both answered; night-feed balance; relationship nudges; private and shared chats |
| F7 | Notifications | Local reminders before predicted windows and for the daily check-in |
| F8 | Account deletion | Deletes the user, and the family's data when they are the last member |

Roadmap only: pumping, growth charts, medication tracking, tips library, more caregivers and babies, iOS, WhatsApp logging, EU hosting for the AI.

## Data model

Ten tables, all with RLS. Every row hangs off a family; one helper, `is_family_member(family_id)`, protects all of it.

| Table | Key columns |
|---|---|
| profiles | id (= auth user), display_name |
| families | id, created_by |
| family_members | family_id, user_id, role |
| babies | id, family_id, name, birth_date |
| events | id, baby_id, type (feed/sleep/diaper), started_at, ended_at, details (jsonb), created_by, source (tap/chat/voice) |
| invites | family_id, code_hash, expires_at, used_at, created_by |
| chat_threads | id, family_id, owner_id (set = private) |
| chat_messages | thread_id, role, content, author_id, created_at |
| checkins | family_id, user_id, day, answers (jsonb) |
| api_usage | user_id, function, window_start, count |

## Security rules (non-negotiable)

- RLS on every table from its first migration. No table without policies.
- Private threads readable only by `owner_id`. Partner's check-in answers readable only after you answered the same day.
- Pairing: random 8-character code, stored hashed, single use, expires in 24 h, attempts rate-limited.
- AI tool calls: `baby_id` and `family_id` come from the session, **never** from the model. Validate all tool arguments with zod (ranges for ml, minutes, timestamps).
- Buddy chat: no diagnosis, no medication doses. Red-flag symptoms (fever, breathing, dehydration, etc.) return an escalation card (call the paediatrician or 112).
- Only age in weeks and recent events go to the AI. No names, no emails. No chat content or tokens in logs.
- Session tokens in expo-secure-store, never AsyncStorage.
- The APK contains only the public Supabase URL and anon key. Never commit: `.env` files, the service_role key, `MODEL_API_KEY`, keystores, real personal data.
- Per-user rate limits on `chat` and `pair` via `api_usage`.
- Every security control gets a test (pgTAP for RLS, function tests for pair/chat).

## Conventions

- TypeScript strict everywhere; no `any`.
- Database changes only through migrations in `/supabase/migrations`.
- Any change to native modules needs a new EAS build (quota: 15 Android builds/month on free). Prefer JS-only changes.
- CI (GitHub Actions) on every push: typecheck + lint, prediction unit tests, RLS tests against local Supabase, gitleaks.

## Day plan

1. Setup: Muse test call, repo, Supabase project, Expo scaffold, first dev build, this file
2. Auth, schema, all RLS, pairing, RLS tests
3. Tracking and real-time sync
4. Chat and voice logging (chat function, tools, confirm card)
5. Predictions engine, predict function, "Next up" card, notifications
6. Buddy chat context, safety rules, private/shared threads
7. Couple layer, delete-account
8. Security and quality pass, rate limits, CI green
9. Polish, seed-demo script, README
10. Release v1.0.0, demo video, pitch, submit

Protect in this order if behind: security, pairing and sync, chat logging, predictions. Trim UI polish first.
