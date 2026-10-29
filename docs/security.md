# Security notes

## Realtime and RLS

`events`, `family_members`, `chat_messages` and `checkins` are in the
`supabase_realtime` publication (`20261029090000_events_realtime.sql`,
`20261029100000_chat_checkin.sql`). `chat_threads`, `invites`, `api_usage`,
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

## Chat memory

- **What the model sees:** chat history (the last 30 messages) and the thread
  summary. No names, ids or emails go with them, and gated turns never do. The
  summary is rejected before storage if it holds a health keyword, an email, a UUID
  or a family name. Names are read through RLS only for that check.
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
