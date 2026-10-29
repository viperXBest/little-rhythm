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
