# Little Rhythm

Two parents, one baby, one shared rhythm. An Android app built for the Meta Global AI
Developer Hackathon (Indie Developer track), with Muse Spark 1.3 as a tool-calling
agent and Muse Voice Transcribe for voice logging.

Say "she drank 90 ml at 3, she's asleep now", and both phones get the feed and the
sleep, after one tap on Confirm. Then see when the next feed, nap and bedtime are
likely.

## Not a medical app

Little Rhythm never gives health, medical or medication advice.

- **Health questions get only an escalation card.** Any question about symptoms,
  medicine, doses, feeding amounts, development or a parent's health returns no model
  text. The app shows a static card, written in the app and not by the model:
  contact your paediatrician, or call 112 in an emergency (with a Call 112 button).
- **Every turn is checked twice:** an English and Romanian keyword list, and a Muse
  Spark classifier with structured output that runs alongside the agent. Either one
  escalates. Health turns are never fed back to the model as history, summary or
  search.
- **Measured:** a safety set of 332 health and 147 non-health prompts, in English and
  Romanian, including prompt injection and health mixed into logs, was run twice
  through the real function.
  - Every health prompt escalated: 664/664.
  - Urgent cases were flagged as urgent every time: 184/184, with no urgent false
    positive.
  - 3 of 294 non-health prompts escalated (1.02%); those fail safe.
  - Method and every miss: [`docs/safety.md`](docs/safety.md).

## Meta AI in the app

| Model | Where | What it does |
|---|---|---|
| **Muse Spark 1.3** | `chat` Edge Function | A tool-calling agent (up to 4 model calls per message) that turns what a parent typed or said into **proposals**, and answers family-life questions from the log |
| **Muse Spark 1.3** | `chat`, alongside the agent | The health classifier (strict structured output `{health, urgent}`) |
| **Muse Spark 1.3** | `chat`, after the response | Folds older messages into a per-thread summary (memory), checked for health content, names and ids before storage |
| **Muse Voice Transcribe 1.0** | `chat` Edge Function | Turns a spoken log (16 kHz mono WAV, up to 30 s) into text for the same agent |

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
checks its size and header. Muse Voice Transcribe turns it into text, and the agent
runs on that text. Audio is never stored.

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
       chat            JWT → rate limit → thread check → [Muse Voice Transcribe]
                       → Muse Spark agent + health classifier → proposals | escalation
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

## Tests and CI

GitHub Actions runs on every push:
- app typecheck and lint;
- Deno unit tests (prediction engine, agent, health gate, voice checks, memory);
- pgTAP tests for row-level security, plus realtime and Edge Function tests, against a
  local Supabase stack;
- a gitleaks scan of the full git history.

CI has no secrets and makes no model calls.

## AI use disclosure

- **Building:** the code, tests and docs were written with **Claude Code** (Anthropic),
  directed and reviewed by the developer.
- **In the app:** **Muse Spark 1.3** (agent, health classifier, memory summary) and
  **Muse Voice Transcribe 1.0**, through the Meta Model API.
- **Test data and review:** **Muse Spark Open** generated candidate prompts for the
  safety set, which were curated by hand
  ([`scripts/safety/generate.ts`](scripts/safety/generate.ts)). It also ran an
  independent security and rubric review of the repo
  ([`scripts/review/review.ts`](scripts/review/review.ts)); its findings were triaged
  by hand ([`docs/security.md`](docs/security.md)).

## License

[MIT](LICENSE)
