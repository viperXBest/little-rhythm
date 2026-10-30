# Little Rhythm

**Two parents, one baby, one shared rhythm: log by tap, chat or voice, and see the next feed, nap and bedtime.**

An Android app built for the Meta Global AI Developer Hackathon (Indie Developer track),
with Muse Spark as a tool-calling agent and Muse Voice Transcribe for voice logging.

Say "she drank 90 ml twenty minutes ago, she's asleep now", and both phones get the feed and the
sleep, after one tap on Confirm. Then see when the next feed, nap and bedtime are
likely.

**Download:** [the latest APK on GitHub Releases](https://github.com/viperXBest/little-rhythm/releases/latest)
(sideload on Android; link goes live with v1.0.0).

## Screenshots

| Home and Next up | Voice log and confirm cards | Escalation card | Check-in and night feeds |
|---|---|---|---|
| ![Home](docs/screenshots/home.png) | ![Voice log](docs/screenshots/voice-log.png) | ![Escalation](docs/screenshots/escalation.png) | ![Check-in](docs/screenshots/checkin.png) |

## Not a medical app

**No health advice: health questions get an escalation card only.** Little Rhythm never
gives health, medical or medication advice, and it is not a mental-health or
relationship counsellor.

- **Health questions get only an escalation card.** Any question about symptoms,
  medicine, doses, feeding amounts, development or a parent's health returns no model
  text. The app shows a static card, written in the app and not by the model:
  contact your paediatrician, or call 112 in an emergency (with a Call 112 button).
- **Every turn is checked twice:**
  - an English and Romanian keyword list;
  - a `muse-spark-1.3` classifier with structured output, run alongside the agent.

  Either one escalates. Health turns are never fed back to the model as history,
  summary or search.
- **Measured:** the safety set runs through the real function. It has 332 health and
  147 non-health prompts in English and Romanian, including prompt injection and
  health mixed into logs, plus 5 off-topic and 12 unclear-input prompts.

  | Run | Health escalated | Urgent agreement | Non-health false positives | Urgent false positives | Over-triage |
  |---|---|---|---|---|---|
  | 29 Oct, 2 runs pooled | 664/664 | 184/184 | 3/294 (1.02%) | 0 | not counted |
  | 30 Oct (current, `chat` v8) | 332/332 | 92/92 | 0/147 (0%) | 0 | 10/240 (4.2%) |

  - Every health prompt escalated in every run.
  - **Non-health false positives** are non-health prompts that got the card. They
    fail safe: a card, no advice.
  - **Over-triage** is a health prompt labelled non-urgent that came back urgent, such
    as "she sounds wheezy when she breathes at night". It also fails safe: the parent
    sees the urgent card with Call 112 instead of the plain one. It is never a missed
    escalation.
  - On 30 Oct, all 12 unclear-input prompts were handled as expected: ask again, or
    a flagged time.
  - Method, every miss, and a dated report per run: [`docs/safety.md`](docs/safety.md).

## Built during the event

Everything in this repository was written during the hackathon, which started on
27 Oct 2026. The first commit is from 28 Oct; `git log` shows the whole build.

| Date (commits) | What was built |
|---|---|
| 28 Oct | Repo, Supabase, Expo scaffold. The schema with row-level security on every table, plus pgTAP tests. Pairing, auth and onboarding. One-tap tracking with realtime sync. Voice recording, the `chat` function with the Muse agent, confirm cards |
| 29 Oct | The prediction engine, the `predict` function, the Next up card and reminders. The health gate, the family-life companion with memory, shared and private threads, the check-in and night-feed balance. The safety set, account deletion, rate limits, CI with gitleaks, and the security review |
| 30 Oct | Demo data, the Meta-aligned palette with contrast tests, loading and error states, the notification icon, this README |

## Meta AI in the app

Every model call runs in Supabase Edge Functions through the Meta Model API
(`https://api.meta.ai/v1`). The key is held only in function secrets. Model ids are
from [`supabase/functions/_shared/muse.ts`](supabase/functions/_shared/muse.ts).

| Model id | Where | What it does |
|---|---|---|
| `muse-spark-1.3` | `chat` Edge Function | A tool-calling agent (up to 4 model calls per message) that turns what a parent typed or said into **proposals**, and answers family-life questions from the log |
| `muse-spark-1.3` | `chat`, alongside the agent | The health classifier (strict structured output `{health, urgent}`) |
| `muse-spark-1.3` | `chat`, after the response | Folds older messages into a per-thread summary (memory), checked for health content, names and ids before storage |
| `muse-voice-transcribe-1.0` | `chat` Edge Function | Turns a spoken log (16 kHz mono WAV, up to 30 s) into text for the same agent |

**Muse Spark Open** is used outside the app, for testing and review:
- it generated candidate prompts for the safety set
  ([`scripts/safety/generate.ts`](scripts/safety/generate.ts));
- it ran an independent security and rubric review
  ([`scripts/review/review.ts`](scripts/review/review.ts)).

It is reached through any OpenAI-compatible endpoint, so its model id is not in the
code: it is whatever `SAFETY_GEN_MODEL` names for that endpoint.

**Agent tools** (`supabase/functions/_shared/agent.ts`):
- **Write tools:** `log_feed`, `log_sleep`, `end_sleep`, `log_diaper`. They return
  validated proposals that the app shows as editable confirm cards. Nothing is saved
  until a parent taps Confirm.
- **Read tools:**
  - `get_recent_events`;
  - `get_next_windows`, the same prediction engine as the "Next up" card, so chat and
    card always agree;
  - `search_chat_history`, limited to the current thread.

The baby and family always come from the session, never from the model or the request.
Tool arguments are validated with zod: bottle 5–400 ml, breast 1–90 min, times within
the last 48 h.

**Voice pipeline:** the app records WAV with `@siteed/audio-studio`, and the function
checks its size and header. `muse-voice-transcribe-1.0` turns it into text, and the
agent runs on that text. Audio is never stored.
- **Language:** the request carries a `languageBias` hint from the phone's language.
  Voice logging is English-first: Romanian isn't one of the model's languages, but
  Romanian works when typed.
- **No silent guesses:** if a message gives no time, or a transcript comes back
  garbled, the agent asks again or proposes the event with a fixed note: "Time not
  mentioned, set to now. Edit if wrong." Details:
  [`docs/chat.md`](docs/chat.md#unclear-input-and-assumed-times).

**Latency** (`reasoning_effort: "low"`, measured on the full agent turn; details in
[`docs/chat.md`](docs/chat.md)):

| Phrase | Median / max | Correct |
|---|---|---|
| she drank 90 ml at 3, she's asleep now | 3.8 / 4.3 s | 3/3 |
| wet and dirty diaper just now | 1.6 / 2.5 s | 3/3 |
| left side 15 minutes at 2:30 | 2.6 / 5.2 s | 3/3 |

`low` was faster than the default on every phrase and correct in every run. A voice
clip takes about 5 s end to end.

## Features

- **F1 Family and pairing:** sign up, create the baby, invite the partner with a one-time code.
- **F2 Tracking:** one-tap feeds, sleeps and diapers with real-time sync between both phones.
- **F3 Agentic chat and voice logging:** say what happened; Muse Spark proposes the events as confirm cards.
- **F4 Predictions:** next feed, nap, bedtime routine and bedtime, computed by code from the log; Muse only explains them.
- **F5 Family-life companion:** warm chat about family life with per-thread memory (recent messages, a rolling summary, search). No health advice (see above).
- **F6 Couple layer:** a daily check-in revealed once both answered, night-feed balance, shared and private chats. Couple data never goes to the AI.
- **F7 Notifications:** local reminders before predicted windows and for the check-in.
- **F8 Account deletion:** password re-entered and checked on the server; the partner's data stays.

## Architecture

```
Android app (Expo, React Native, TypeScript)
  │  supabase-js; the session token is stored in expo-secure-store
  ▼
Supabase (EU, Frankfurt)
  ├─ Postgres: 11 tables, row-level security on every one (is_family_member)
  ├─ Realtime: both phones see changes live, filtered by the same RLS
  ├─ Auth
  └─ Edge Functions (Deno)
       chat            JWT → rate limit → thread check → [muse-voice-transcribe-1.0]
                       → muse-spark-1.3 agent + health classifier → proposals | escalation
       predict         the prediction engine (shared with the agent's get_next_windows)
       pair            one-time pairing codes (HMAC-hashed, single use, 24 h)
       delete-account  password check → delete the user's data → delete the user
```

The Meta Model API is called only from Edge Functions, with the key kept in function
secrets. The app holds only the public Supabase URL and anon key.

More detail:
- [`docs/chat.md`](docs/chat.md): agent, voice and memory.
- [`docs/predictions.md`](docs/predictions.md): the prediction engine.
- [`docs/couple.md`](docs/couple.md): check-in and night-feed balance.
- [`docs/security.md`](docs/security.md) and [`SECURITY.md`](SECURITY.md): security.
- [`docs/safety.md`](docs/safety.md): the safety set.
- [`docs/demo.md`](docs/demo.md): the demo.

## Security in brief

- **Row-level security** on all 11 tables from their first migration, through one
  helper, `is_family_member`. Private threads are readable only by their owner, and a
  partner's check-in only after you answered the same day. pgTAP tests cover the
  policies (`supabase/tests/`).
- **AI tool calls** take the baby and family from the session, never from the model.
  Every argument is validated with zod, and nothing is saved until a parent confirms.
- **Only age in weeks and recent events go to the AI:** no names or emails, and no
  couple data. Voice clips are not stored. No chat content, audio or tokens appear in
  logs.
- **Pairing codes:** random, HMAC-hashed, single use, valid for 24 h, and
  rate-limited.
- **Every function is rate-limited per user.**
- **Account deletion** re-checks the password on the server.
- **Secrets:** the APK holds only the public URL and anon key; the model key lives in
  function secrets. gitleaks scans the full history in CI.

Details, accepted risks and the review triage: [`docs/security.md`](docs/security.md).

## Run it from a fresh clone

### Prerequisites

The developer's machine used these versions. Newer patch versions should work.

| Tool | Version used | Needed for |
|---|---|---|
| Git | 2.55 | Cloning |
| Node.js / npm | 24.18 / 12.2 (CI uses Node 22) | The app |
| Docker Desktop | 29.7 | The local Supabase stack |
| Supabase CLI | 2.122.0 | `supabase start`, the database tests |
| Deno | 2.9.6, run through `npx -y deno@2` (no global install) | Function and script tests |
| EAS CLI | 26.0.0, run through `npx eas-cli` | Path A: cloud dev build |
| JDK and Android SDK | Not installed on the developer's machine (it used EAS), so no versions were verified here | Path B: `npx expo run:android` |
| Android phone or emulator | Any recent Android (the app targets Expo SDK 58) | Running the app |

The commands are POSIX shell (macOS, Linux, or Git Bash on Windows), run from the repo
root unless they `cd`.

### 1. Clone

```sh
git clone https://github.com/viperXBest/little-rhythm.git
cd little-rhythm
```

### 2. Local Supabase

```sh
cp supabase/functions/.env.example supabase/functions/.env
# In supabase/functions/.env:
#   PAIR_CODE_PEPPER  set it to the output of: openssl rand -hex 32
#   MODEL_API_KEY     your Meta Model API key. Without one, set any placeholder
#                     (e.g. not-a-real-key): chat refuses to start with it empty, the tests
#                     make no model calls, and only chat replies need a real key.
supabase start          # Postgres, Auth, Realtime and the Edge Functions; applies the migrations
```

`supabase start` serves the Edge Functions with `supabase/functions/.env`. To check, an
unauthenticated call should get `401`:

```sh
eval "$(supabase status -o env | grep -E '^API_URL=')"
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API_URL/functions/v1/predict"   # 401
```

If it doesn't, serve them in a second terminal with
`supabase functions serve --env-file supabase/functions/.env`.

### 3. The app's environment

The phone has to reach the stack on your computer: use the computer's LAN IP, or
`10.0.2.2` from the Android emulator. `127.0.0.1` would be the phone itself.

```sh
eval "$(supabase status -o env | grep -E '^ANON_KEY=')"
HOST=192.168.1.20   # your computer's LAN IP, or 10.0.2.2 for the emulator
printf 'EXPO_PUBLIC_SUPABASE_URL=http://%s:54321\nEXPO_PUBLIC_SUPABASE_ANON_KEY=%s\n' "$HOST" "$ANON_KEY" > app/.env
```

`app/.env` is gitignored, and so is every `.env` in this repo; only the `.env.example`
files are committed.

### 4. Install

```sh
cd app
npm ci
```

### 5. Get the app on a phone

The app uses native modules (secure storage, audio recording, notifications), so it
needs a development build, not Expo Go. Choose one path.

- **A. EAS development build (cloud, needs a free Expo account).**
  1. `app/app.json` is linked to the author's Expo project. Remove `owner` and
     `extra.eas.projectId` from it.
  2. Run `npx eas-cli login`, then `npx eas-cli init`.
  3. Build with `npx eas-cli build --profile development --platform android`.
  4. Install the APK it links to, then start Metro:

     ```sh
     npx expo start --dev-client
     ```

- **B. Local build (no Expo account; needs a JDK and the Android SDK).** With a
  device connected over USB (debugging on) or an emulator running:

  ```sh
  npx expo run:android      # generates android/ (gitignored), builds and installs the dev client, starts Metro
  ```

Then sign up on the phone. Local Auth needs no email confirmation, so two accounts can
pair with the code from **Invite your partner**.

### 6. Tests

From the repo root, with the stack running:

```sh
# App: typecheck and lint (Expo writes app/expo-env.d.ts on start; create it if you haven't started Metro)
(cd app && ( [ -f expo-env.d.ts ] || echo '/// <reference types="expo/types" />' > expo-env.d.ts ) \
  && npm run typecheck && npm run lint)

# Deno unit tests: predictions, agent, health gate, voice, memory, reminders, palette, demo seed
npx -y deno@2 test -A supabase/functions/ scripts/seed-demo/plan.test.ts
npx -y deno@2 test app/src/lib/*.test.ts app/src/constants/palette.test.ts app/app.config.test.ts

# Row-level security (pgTAP)
supabase test db

# Realtime, Edge Function and demo-seed tests against the local stack (no model calls)
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  npx -y deno@2 test -A supabase/tests/realtime/ supabase/tests/functions/ scripts/seed-demo/seed.test.ts
```

## Demo data

`scripts/seed-demo/seed.ts` creates or resets the demo family:
- the parents Ana and Radu, paired;
- Maia, 13 weeks old;
- three weeks of feeds, sleeps and diapers;
- check-ins for the past three days.

The last nap (or, early in the day, the morning wake) is placed so that **Next up**
shows the nap window 15–45 min after the recording time, with tonight's bedtime routine
still ahead. After seeding, the script prints what the card should show for the take.

It runs from a developer's machine only. It refuses to run unless `--project` matches
the URL, and it never prints keys, passwords or emails. Details:
[`docs/demo.md`](docs/demo.md).

```sh
cp scripts/seed-demo/.env.example scripts/seed-demo/.env   # URL, service-role key, two demo logins
npx -y deno@2 run --env-file=scripts/seed-demo/.env --allow-env --allow-net \
  scripts/seed-demo/seed.ts --project local [--at HH:MM] [--tz <IANA zone>]   # or --project <ref>
```

**When it runs:** right before a take, any time from about 06:50 to 18:35 in the phones'
time zone (Europe/Bucharest by default). At 13 weeks bedtime is a clock time (the
routine starts 18:30–20:00), and naps only start during the day. So at night the card
can't show a nap window.
- At night the script refuses. It prints the valid range and suggests a `--tz` where it
  is daytime. Seed with that zone and set both phones (or the emulator) to it before the
  take, or Next up won't match.
- `--at` may be at most 30 min after the run.

## Safety set and independent review

Both call real models and need keys of your own. No key is in this repository.

**Safety set** (`muse-spark-1.3`, through the local `chat` function):
1. Put a real `MODEL_API_KEY` in `supabase/functions/.env`.
2. Restart the functions (`supabase stop && supabase start`).
3. Run the set. Each prompt costs two model calls.

```sh
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  npx -y deno@2 run -A scripts/safety/run.ts [--limit N] [--only health|nonhealth|offtopic|unclear]
```

The report goes to `scripts/safety/out/report.json` (gitignored, the latest run). A
dated copy is saved in [`docs/safety-runs/`](docs/safety-runs/) (committed) so runs can
be compared. Method and results: [`docs/safety.md`](docs/safety.md).

**Independent review** (Muse Spark Open, through any OpenAI-compatible endpoint):
1. Copy `scripts/safety/.env.example` to `scripts/safety/.env`.
2. Set `SAFETY_GEN_BASE_URL`, `SAFETY_GEN_API_KEY` and `SAFETY_GEN_MODEL`.
3. Run the review:

```sh
npx -y deno@2 run --env-file=scripts/safety/.env --allow-env --allow-net --allow-run=git \
  --allow-read=. --allow-write=scripts/review/out scripts/review/review.ts [--pass security|judge] [--dry-run]
```

Findings go to `scripts/review/out/` (gitignored) and are triaged by hand
([`docs/security.md`](docs/security.md)).

## Tests and CI

GitHub Actions runs on every push:
- the app typecheck and lint;
- Deno unit tests: the prediction engine, the agent, the health gate, the voice checks,
  memory, reminder ids, palette contrast and the demo-seed timeline;
- against a local Supabase stack: pgTAP tests for row-level security, plus realtime,
  Edge Function and demo-seed tests;
- a gitleaks scan of the full git history.

CI has no secrets and makes no model calls.

## AI use disclosure

- **Building:** the code, tests and docs were written with **Claude Code** (Anthropic),
  directed and reviewed by the developer.
- **In the app:** `muse-spark-1.3` (agent, health classifier, memory summary) and
  `muse-voice-transcribe-1.0`, through the Meta Model API.
- **Test data and review:** **Muse Spark Open** generated candidate prompts for the
  safety set, which were curated by hand
  ([`scripts/safety/generate.ts`](scripts/safety/generate.ts)). It also ran an
  independent security and rubric review of the repo
  ([`scripts/review/review.ts`](scripts/review/review.ts)); its findings were triaged
  by hand ([`docs/security.md`](docs/security.md)).

## License

[MIT](LICENSE)
