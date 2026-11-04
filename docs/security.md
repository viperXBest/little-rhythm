# Security notes

## Realtime and RLS

`events`, `family_members`, `chat_messages`, `checkins` and `growth_measurements` are in the
`supabase_realtime` publication (`20261029090000_events_realtime.sql`,
`20261029100000_chat_checkin.sql`, `20261103140000_growth.sql`). `chat_threads`, `invites`, `api_usage`, `usage_counters`,
`profiles`, `babies` and `families` are not; `supabase/tests/05_events.test.sql`
asserts both.

For INSERT and UPDATE, Realtime runs the subscriber's `select` policy against the
changed row before sending it. A client filter such as `baby_id=eq.<id>` narrows
what it receives but grants nothing: a filter pointed at another family's baby
gets no rows.

**Check:** `supabase/tests/realtime/realtime_rls.test.ts` runs against the local
stack. A parent in family A subscribes to all `events`, to `family_members`, and on
a channel filtered to family B's baby. Family B gets a new member and logs a feed,
then family A does the same. A receives family A's two changes and nothing from family B.
A second test covers chat and check-ins: the partner receives shared-thread messages
but not the other parent's private ones, and a check-in only for a day they have
already answered.

```sh
supabase start
eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
SUPABASE_URL=$API_URL SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY \
  deno test -A supabase/tests/realtime/
```

**Subscribe with the user's JWT.** A socket still on the anon key gets a data-less
`Error 401: Unauthorized` stub for every published change. The app subscribes only
once it has a session, and it sets the realtime token first.

### Known caveat: DELETE

Postgres can't check RLS on a row that no longer exists, so Realtime doesn't filter
DELETE events. Client filters don't apply to deletes either. With the default replica
identity, a DELETE payload carries only the primary key. So **delete PKs go to every
`events` subscriber across all families**: random UUIDs, with no baby, family, type,
time or details. The app ignores ids that aren't in its own list.

`chat_messages` and `checkins` have no delete policy, so clients can't delete them.
They are deleted only by cascade (account or family deletion), which broadcasts
their primary keys in the same way.

Accepted for the demo. The roadmap fix is soft delete (`deleted_at` set through an
UPDATE), which goes through RLS like any other update.

## Event integrity

- One open sleep per baby: partial unique index `events_one_open_sleep_idx`. When
  both parents tap "start sleep", the second gets `23505` and the app shows the
  partner's sleep.
- Clients can update only `started_at`, `ended_at` and `details` (column grants).
  `id`, `baby_id`, `type`, `created_by`, `source` and `created_at` are fixed at
  insert. To fix a wrong type, delete the event and log it again.
- Inserts must have `created_by = auth.uid()` and a baby in the caller's family.

## Growth records (v1.2.0)

`growth_measurements` (weight in grams, length and head in millimetres, a date) is protected
by family RLS only, through `is_family_member` on the baby's family. Members can select and
delete, insert `baby_id`, `kind`, `value` and `measured_on`, and update only `value` and
`measured_on`; the author comes from `auth.uid()`. The CHECK bounds are typo guards (for
example weight 300–30,000 g), not norms. **No Edge Function reads this table, so growth
never reaches the AI:** a CI step runs `git grep growth_measurements -- supabase/functions`
and fails the build on any hit. Rows go with the baby (`on delete cascade`), so the last
member's account deletion removes them with the family. When one of two parents deletes
their account, the rows stay and `created_by` becomes null. The migration is not on hosted
until it is pushed (see "Deployed versions").

## Chat memory

- **What the model sees:** chat history (the last 30 usable messages) and the thread
  summary. The server adds no names, ids or emails to them, and gated turns never
  go in. The messages are what the parents typed or said, so a name or an email a
  parent wrote would be in them: only the summary is checked, and is rejected before
  storage if it holds a health keyword, an email, a UUID or a family name. Names are read
  through RLS only for that check. <!-- CLASSIFIER -->The health classifier gets only the baby's age in weeks and the parent's message.<!-- /CLASSIFIER --> The Meta Model API is outside the
  EU. Growth records and couple data are never sent. The full list of what goes to the AI is in
  [`docs/chat.md`](chat.md#what-goes-to-the-ai).
- **`chat_messages` writes:** only the chat function writes messages, with the service
  role after the thread check and the health gate. Clients have no insert policy and no
  INSERT or UPDATE privilege (`20261030100000_chat_messages_server_insert.sql`), so a
  health question can't be stored ungated by going around the function. `gated` is set
  by the function. A health question is stored gated from the start,
  so there is no window where it sits ungated.
- **`thread_memory`:**
  - The select policy mirrors thread visibility: a private thread's summary is its
    owner's only.
  - It has no insert, update or delete policy; those privileges are revoked from
    `authenticated`.
  - It cascades with its thread. Day 7's `delete-account` removes it with the
    family's threads.
  - It is not in the realtime publication.
- **Search:** `search_thread_messages` is SECURITY INVOKER, so RLS decides which
  threads exist for the caller. It never returns gated or escalation rows.
  `public.f_unaccent` is an immutable wrapper around `extensions.unaccent` with a
  fixed dictionary.
- **Tests:** `supabase/tests/06_chat_memory.test.sql`.

## Account deletion

`delete-account` (F8) requires a valid JWT and the password, re-entered and checked
server-side by signing in on a throwaway client; the result must be the caller's own
user id. It is rate-limited to 5 attempts an hour, and it then runs
`delete_account_data` (service role only) and deletes the auth user.

- **Last member of the family:** the family and everything under it.
- **One parent of two:**
  - their private thread (messages and summary cascade);
  - their shared-thread turns, with the replies linked through `chat_messages.reply_to`;
  - the shared thread's summary (it re-folds without them);
  - their check-ins, pending invites, membership, rate-limit rows and profile.

  Their events stay, with `created_by = null`. The partner's rows are untouched.
- **Tests:** `supabase/tests/07_delete_account.test.sql`, `supabase/tests/functions/delete-account.test.ts`.

### What the password check protects against

Re-entering the password stops someone holding only a stolen session from deleting
the account. To get around it, they would have to change the password first, and Auth
blocks that two ways:

- **Require current password when updating** (hosted only). `PUT /auth/v1/user` with
  a new password must also carry the current one. From `internal/api/user.go` in
  supabase/auth at commit
  [`3afa027`](https://github.com/supabase/auth/blob/3afa027c5cd0709ae82b46b461c8addbfd527be9/internal/api/user.go#L171-L186):

  ```go
  // current password required when updating password
  if config.Security.UpdatePasswordRequireCurrentPassword {
      // ensure user is not in a password recovery flow
      if !session.IsRecovery() {
          if params.CurrentPassword == nil || *params.CurrentPassword == "" {
              return apierrors.NewBadRequestError(apierrors.ErrorCodeCurrentPasswordRequired, ...)
  ```

  - **Where it is set:** the hosted dashboard, Authentication → Sign In / Providers →
    Email → "Require current password when updating" (Studio:
    `SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`).
  - **Not covered locally or in CI:** Supabase CLI v2.122.0 has no `config.toml` key
    for it, so the local stack and CI don't enforce it.
  - **Exception:** a recovery session (opened from a password-reset email) skips the
    check. Using it needs the user's inbox, not just a stolen token.
- **Secure password change** (`[auth.email] secure_password_change = true` in
  `supabase/config.toml`, and on hosted). Auth asks for a reauthentication code when
  the session is missing or more than 24 hours old (`user.go`
  [L154-L157](https://github.com/supabase/auth/blob/3afa027c5cd0709ae82b46b461c8addbfd527be9/internal/api/user.go#L154-L157)):
  `if session == nil || now.After(session.CreatedAt.Add(24*time.Hour))`. In Supabase CLI
  v2.122.0, `pkg/config/auth.go` maps `secure_password_change` to
  `SecurityUpdatePasswordRequireReauthentication`. On its own it leaves sessions under
  24 h open; together with the current-password requirement, it is defence in depth.

**Verified on hosted** (29 Oct 2026, Auth v2.197.0), with a throwaway account that had
no family:

| Step | Result |
|---|---|
| `PUT /auth/v1/user` with a new password, no `current_password` | 400 `current_password_required` |
| Same, wrong `current_password` | 400 `current_password_invalid` |
| Same, right `current_password` (control) | 200 |
| `delete-account` with the old password | 403 `invalid_password` |
| `delete-account` with the current password | 200 `{deleted: true}` (no-family path) |
| Sign-in afterwards | 400 `invalid_credentials`; no `auth.users` or orphan `profiles` row left |

Re-run this check after any change to the hosted Auth settings.

**What a stolen session can still do:** read and delete the family's events and send
messages through RLS, as the user could. Deleting the account needs the password.

## Rate limits

Every function counts calls per user in fixed windows (`api_usage`, through
`consume_rate_limit`, which only the service role can call). Over the limit, the call
returns `429 rate_limited` before any model call, password check or code lookup.

| Function | Limit | Why | Test |
|---|---|---|---|
| `chat` | 60 an hour | Each turn makes 2 or more model calls | `tests/functions/chat.test.ts` |
| `chat` | 60 a UTC day per user, 100 per family | A real family stays well under (`docs/chat.md`, "Limits and spend") | `tests/08_chat_budget.test.sql`, `tests/functions/chat.test.ts` |
| `chat` | $10 a UTC day across everyone (assumed prices) | Global circuit breaker on Muse spend | `tests/08_chat_budget.test.sql`, `tests/functions/chat.test.ts` |
| `predict` | 240 an hour | Cheap, but called on every app focus | `tests/functions/predict.test.ts` |
| `pair` create | 10 an hour | New codes | `tests/functions/pair.test.ts` |
| `pair` redeem | 5 per 15 min | Each attempt is a guess at a code | `tests/functions/pair.test.ts` |
| `delete-account` | 5 an hour | Each attempt is a password guess | `tests/functions/delete-account.test.ts` |

The tests fill the caller's current window and check that the next call gets 429.

**Chat daily caps and the spend breaker (v1.1.0).** From the 2 Nov review (item 4):
the hourly limit alone allowed 1,440 chat calls a day per account, with no family or
global bound, and sign-up is cheap.
- The chat function calls `consume_chat_budget` after the thread check and before
  transcription or any model call. It returns the first cap that refused, and the
  function answers with the same `429 rate_limited` as the hourly limit.
- The per-user daily count reuses `api_usage` through `consume_rate_limit`
  (function `chat_day`). The family count and the global spend live in
  `usage_counters` (`20261102120000_chat_daily_caps.sql`), the twelfth table:
  - RLS from its first migration. A family member can read their family's turn
    count; nobody but the service role can read the global row.
  - No client writes: INSERT, UPDATE and DELETE are revoked from `authenticated`,
    and `anon` has nothing.
  - `consume_chat_budget` and `settle_chat_spend` are service-role only.
  - Family rows cascade with the family. Deleting an account never lowers the global
    counter, so "spend, delete, sign up again" doesn't reset the breaker.
- A level is counted only after the level before it passed: refused calls can't
  drain the family's or the global budget.
- Each admitted turn reserves its worst case and settles to the metered cost, so
  the spend can't pass the budget with turns in flight. Prices are assumed; the
  numbers and the arithmetic are in `docs/chat.md`, "Limits and spend".
- Accepted: the breaker is global, so anyone who reaches it stops chat for every
  family until the next UTC day. That's the point of a circuit breaker; the per-user
  and per-family caps make one account's share small.
Auth's own sign-in limit applies to the password check too; `delete-account` reports it
as 429, not as a wrong password.

**Hosted settings for the judging window (2 Nov).** Sign-up stays open, so judges can
create their own family.
- **Auth rate limit:** hosted Auth rate-limits sign-ups and sign-ins per IP (set in the
  dashboard, Authentication → Rate Limits). It doesn't touch the demo seed, which uses
  the admin API (`auth.admin.createUser` / `updateUserById`). A demo take signs in twice.
- **Not enabled:**
  - **Email confirmation:** Supabase's built-in SMTP sends only to the project team's
    addresses, so a judge couldn't confirm.
  - **Captcha:** it needs a widget in the app and a new build.
- **Money:** the Meta account has no spend-limit setting. The prepaid credits are the
  hard cap, and the $10/day breaker keeps one day's spend well inside them.

### Runbook: chat paused by the global breaker

**Symptom:** every chat or voice turn returns `429 rate_limited` for every family while
the per-user and per-family caps aren't reached. Tap logging, sync, Next up and the
check-in keep working; only chat waits for the next UTC day.

Run the steps in the hosted dashboard's SQL editor (it runs as `postgres`, which bypasses
RLS). Each step reads before it writes.

1. **Check today's global spend** (micro-USD; 10,000,000 is the $10 cap):

   ```sql
   select window_start, count from public.usage_counters
   where scope = 'global' and function = 'chat_spend'
   order by window_start desc limit 3;
   ```

2. **Find who used it.** These are today's chat turns per user, with each account's age:

   ```sql
   select a.user_id, a.count, u.created_at
   from public.api_usage a join auth.users u on u.id = a.user_id
   where a.function = 'chat_day'
     and a.window_start = to_timestamp(floor(extract(epoch from now()) / 86400) * 86400)
   order by a.count desc limit 20;
   ```

   A real family stays far below 60 turns a day. Many new accounts near 60 at once is the
   abuse pattern.
3. **Remove the abusive accounts.** Delete them in Authentication → Users. Their
   memberships, private threads and usage rows cascade. Never delete the two demo
   accounts.
   - **Optional cleanup:** a family left with no members is unreachable through RLS.
     List those families first, then delete them; babies, events, threads and check-ins
     cascade.

     ```sql
     select f.id, f.created_at from public.families f
     where not exists (select 1 from public.family_members m where m.family_id = f.id);
     ```

4. **Give the budget back.** Only after step 3, or the same accounts drain it again:

   ```sql
   update public.usage_counters set count = 0
   where scope = 'global' and function = 'chat_spend'
     and window_start = to_timestamp(floor(extract(epoch from now()) / 86400) * 86400);
   ```

   This allows another $10 of spend today, so check the remaining Meta credits first.
   Deleting accounts never lowers the counter by itself (see above).
5. **Verify:** one chat turn from a demo account returns a reply, not 429.

**Never** raise the cap in code or point the safety set at hosted during judging. One
full safety run meters about $4–5.

## Logging

- **What functions log:** a fixed code and, at most, an HTTP status or Postgres error
  code (`chat: rate limit failed 42501`, `chat: model_failed 502`).
- **What they never log:** message text, transcripts, audio, tool arguments,
  passwords, tokens or emails.
- **Error codes are safe:** `MuseError.code` is a two-value union, and unknown errors
  are logged as `unexpected` because their message might echo input.
- **Hosted audit, 29 Oct 2026, last 24 h:**
  - Read-only, through the Management API's unified logs endpoint. The old `logs.all`
    endpoint returns 410.
  - 50 console lines (chat 28, predict 18, delete-account 4) and 29 request lines.
  - All console lines were runtime boot or shutdown messages.
  - No hits for emails, JWT-shaped strings, keys, base64 audio, query strings or free
    text.
  - The request logs that Supabase itself keeps include the client IP, coarse location,
    user agent, user id and a JWT signature prefix. That is the platform's own
    logging, not ours, and it is kept under Supabase's log retention.

## Dependencies

- **Edge Functions:** every import is pinned to an exact version
  (`npm:zod@4.6.6`, `npm:@supabase/supabase-js@2.49.4`, `npm:openai@7.32.0`,
  `jsr:@std/assert@1.0.13`). zod 4.6.6 is the fixed version for GHSA-mrhx-c7xc-m3w5.
- **App: `npm audit`, 29 Oct 2026:** 3 high and 7 low. All come from build and lint
  tooling.
  - **Accepted, high:** `zod@3.25.76` (GHSA-mrhx-c7xc-m3w5, memory use while
    validating oversized collections).
    - It comes only through `@expo/cli` (the build CLI) and `eslint-plugin-react-hooks`
      (lint).
    - Nothing in `app/src` imports zod, so it is not in the APK. It only validates the
      developer's own config.
    - The fix is zod 4, a major version the Expo CLI doesn't support. Forcing it with an
      override could break builds.
    - The other two highs, `expo` and `@expo/cli`, are this same advisory reported
      through the dependency chain.
  - **Accepted, low:** `deepmerge` (prototype pollution) through `@expo/config`, which is
    also build-time only. The rest are the same chain reported again.

## Deployed versions

**Pending for v1.2.0 (4 Nov):** hosted still has migration `20261103090000` as its last one.
`20261103140000_growth.sql` (the growth table) is not pushed yet, and the hosted functions
are unchanged since v1.1.1 (`chat` v10 and the three below), because no function changed.
The app build for v1.2.0 needs the migration first. The table below is the hosted state.

Hosted Edge Functions for release v1.1.1 (checked with `supabase functions list` on
3 Nov). Each was deployed from source identical to the release commit for that
function's import graph, or differing only in comments and strings it never uses
(`deno info`).

| Function | Version | Deployed (UTC) | From |
|---|---|---|---|
| `chat` | v10 | 3 Nov, 08:49 | `38a81e7` (= `supabase/functions` at the v1.1.1 tag): agent steps, crisis override, safe-sleep prompt line, no age-norm claims, `CHAT_GLOBAL_DAILY_USD`, new-account cap. Migration `20261103090000` pushed first. Smoke-tested on hosted: a normal turn, the demo line (two cards, steps), a fever message (card only) |
| `predict` | v4 | 2 Nov, 18:52 | `491b761`. Since then its import graph changed only a tool-description string in `agent-schemas.ts` (it imports `TZ_OFFSET` from that file) and a comment in `predict-constants.ts`: runtime-identical, no redeploy |
| `pair` | v4 | 30 Oct, 13:22 | `3191717`, import graph identical to v1.1.1 |
| `delete-account` | v2 | 30 Oct, 13:22 | `3191717`, import graph identical to v1.1.1 |

Latest migration on hosted: `20261103090000_chat_new_account_cap.sql` (3 Nov). It keeps
the 5-argument `consume_chat_budget` as a wrapper so `chat` v9 kept working until v10
was deployed; dropping it is on the roadmap.

**Earlier:** `chat` v9 (2 Nov, 18:23, from `20242e8`: caps, spend breaker,
`max_completion_tokens`, prompt rule, classifier timeout 30 s; migration
`20261102120000` pushed first) was v1.1.0's.

**v1.1.0 server track (2 Nov).** Only `chat` changes behaviour. Order on hosted, after
the owner approves: the migration first (the new `chat` calls `consume_chat_budget`
and would answer 500 without it), then `chat`. `pair` and `delete-account` import
nothing that changed. `predict`'s import graph includes `_shared/agent.ts` through a
type-only import in `chat-data.ts`; its runtime code is unchanged, so a redeploy is
needed only to keep "hosted equals the release commit" exact.

**Why the Day 9 redeploy.** `pair`, `predict` and `delete-account` predated later
commits to files they import. None of those commits changes behaviour:
- `userClient()` was added to `_shared/supabase.ts` for the chat function;
- chat-only reads were added to `_shared/chat-data.ts`;
- a comment in `delete-account` was rewritten.

But `pair` v3 was deployed 9 s before the zod 4.6.6 commit (`cf3fb21`), so git couldn't
prove that version included it. Redeploying all three from HEAD made hosted equal to
the release commit. The function tests passed on the local stack first. Each function
answers 401 without a session.

**Rule after the v1.1.1 tag:** if any later commit touches `supabase/functions`, redeploy what
it affects (and rerun the safety set if `chat` changes).

## Independent review (Muse Spark Open)

`scripts/review/review.ts` sends the tracked files (no lockfiles, binaries, env files
or fixtures) to Muse Spark Open in two passes: a security audit and a judge's review
against the hackathon rubric. Output goes to `scripts/review/out/` (gitignored), and
every finding is triaged by hand before anything changes.

**Accepted:** the realtime DELETE broadcast of primary keys, described above under
"Known caveat: DELETE".

### Review false positives

- **"tz_offset_minutes is never range-checked, so a huge offset bypasses the time
  checks"** (`_shared/agent-schemas.ts:131`).
  - The offset is checked against -840..840 when the request is parsed, before
    `resolveTimestamp` sees it: `chat/request.ts` (JSON and multipart) and
    `predict/request.ts`. Out of range is a 400.
  - Even without that, a proposal is saved only by the parent's own session through
    RLS, and that session could insert any time anyway.
  - Tests: "tz_offset_minutes outside -840..840 is a 400" in `chat/request.test.ts`
    and `predict/request.test.ts`.
- **"An escalated turn still returns proposals, which can carry health advice"**
  (`chat/index.ts`).
  - Deliberate: logging is not advice (`docs/chat.md`, "Health gate").
  - A proposal holds only enums, numbers and timestamps: feed kind, ml, side, minutes,
    wet/dirty, start and end (`agent-schemas.ts`), so there is no free-text field for
    advice to travel in.
  - The stored `proposal_summary` is built by the server from those fields
    (`buddy-context.ts`, `proposalSummary`), not by the model.
- **"`supabase/.gitignore` doesn't ignore `.env`"**. The root `.gitignore` has `.env`,
  which applies at every depth. `git check-ignore -v supabase/.env
  supabase/functions/.env` matches `.gitignore:2`.

### Fixed after the review

- **Client inserts into `chat_messages` skipped the health gate.** Found by the Claude
  Code security review. Only the chat function writes messages now; see "Chat memory".
