# Security

Little Rhythm holds a baby's daily log, two parents' chats and their check-ins. This
page covers what we protect, how, how to check it, and how to report a problem. The
details are in [`docs/security.md`](docs/security.md).

## Threat model

| Threat | What could go wrong | Main controls |
|---|---|---|
| Another family | Reads or writes another family's baby, events, chats or check-ins | RLS on every table through `is_family_member()`; Realtime filtered by the same RLS |
| The partner | Reads the other parent's private chat, or their check-in before answering the same day | Private threads readable only by `owner_id`; check-in reveal policy |
| A stolen session | Deletes the account, or changes the password and then deletes it | `delete-account` re-checks the password on the server; hosted Auth requires the current password to change it, plus secure password change |
| Prompt injection | The model logs events for another baby, or gives medical advice | `baby_id` and `family_id` come from the session, never from the model; tool arguments validated with zod; health gate (keywords plus classifier) returns only a static card |
| Going around the AI | A client writes chat messages directly, skipping the health gate | Only the chat function writes `chat_messages` (no client INSERT) |
| The APK | Keys pulled from the app | The APK holds only the public Supabase URL and anon key; the model key and service role stay in Edge Function secrets |
| Abuse and cost | Brute-forcing pairing codes or passwords; running up model calls | Per-user rate limits on `chat`, `predict`, `pair` and `delete-account`; pairing codes are random, HMAC-hashed, single use and expire in 24 h |
| Leaks | Chat content, transcripts, audio, tokens or emails in logs or git | Functions log error codes only; audio is never stored; gitleaks on every push |

Out of scope for this demo build: the realtime DELETE caveat (deleted rows' primary
keys reach every subscriber, with no content; see `docs/security.md`), and hosting
for the AI (the Meta Model API is outside the EU).

## Controls in short

- **Database:**
  - Postgres row-level security on all 11 tables from their first migration.
  - SECURITY DEFINER functions with an empty `search_path`, callable only where
    needed.
  - Clients can update only the columns that should change.
- **Edge Functions:**
  - Every function requires a valid JWT and checks the caller again.
  - The service role is used only after that check.
  - Request bodies are strict zod schemas with size limits.
- **AI:**
  - Only the baby's age in weeks and recent events go to the model, never names,
    emails or couple data.
  - Every turn passes the health gate.
  - Gated turns never reach the model again.
- **Account deletion:** the password is re-entered and checked on the server, and the
  call is rate-limited. The last member's family is deleted in full; when one of two
  parents leaves, only their own data goes.
- **App:** the session is kept in `expo-secure-store`, never in AsyncStorage.

## How to verify

```sh
supabase start
supabase db reset && supabase test db          # RLS and privileges (pgTAP)
npx -y deno@2 test -A supabase/functions/      # unit tests (engine, agent, health gate, requests)
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  npx -y deno@2 test -A supabase/tests/realtime/ supabase/tests/functions/
gitleaks git . --config .gitleaks.toml --redact
```

CI runs all of these on every push, with no secrets and no model calls
(`.github/workflows/ci.yml`).

Some controls are hosted Auth settings that the local stack and CI can't cover (for
example "Require current password when updating"). `docs/security.md` gives the manual
check for each one.

## Reporting a vulnerability

Please report it privately through GitHub: **Security → Report a vulnerability** on
this repository (private vulnerability reporting). Don't open a public issue. Include
what you found, how to reproduce it, and what it affects. Replies are best effort, usually within a week.

Please test only against your own accounts and the local stack, not other people's
data.
