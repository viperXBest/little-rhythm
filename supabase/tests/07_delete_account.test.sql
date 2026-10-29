-- Account deletion: delete_account_data is service-role only; reply_to is
-- server-only and backfilled conservatively; the partner path removes only the
-- leaving parent's data, and the last member takes the family with them.
begin;
create extension if not exists pgtap with schema extensions;

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.create_user(p_id uuid, p_name text) returns void
language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_id::text || '@test.local', jsonb_build_object('display_name', p_name), now(), now());
$$;

create function tests.as_user(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create function tests.as_postgres() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'postgres', true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

select plan(31);

-- ---- privileges ---------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.delete_account_data(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.delete_account_data(uuid)', 'execute'),
  'clients cannot call delete_account_data');
select ok(
  has_function_privilege('service_role', 'public.delete_account_data(uuid)', 'execute'),
  'the service role can call delete_account_data');
select ok(
  not has_function_privilege('authenticated', 'public.link_unlinked_replies()', 'execute')
  and not has_function_privilege('service_role', 'public.link_unlinked_replies()', 'execute'),
  'the reply_to backfill is not callable by clients or the service role');

-- ---- fixtures -----------------------------------------------------------------
-- Family A: A1 (leaves first) and A2. Family B: B1, untouched throughout.
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000001', 'A1');
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000002', 'A2');
select tests.create_user('bbbbbbbb-0000-0000-0000-000000000001', 'B1');

insert into public.families (id, created_by) values
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-f000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into public.family_members (family_id, user_id) values
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-f000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into public.babies (id, family_id, name, birth_date) values
  ('aaaaaaaa-b000-0000-0000-000000000000', 'aaaaaaaa-f000-0000-0000-000000000000', 'Ana', current_date - 60),
  ('bbbbbbbb-b000-0000-0000-000000000000', 'bbbbbbbb-f000-0000-0000-000000000000', 'Bia', current_date - 60);
insert into public.events (id, baby_id, type, started_at, created_by) values
  ('aaaaaaaa-e000-0000-0000-000000000001', 'aaaaaaaa-b000-0000-0000-000000000000', 'diaper', now() - interval '2 h', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-e000-0000-0000-000000000002', 'aaaaaaaa-b000-0000-0000-000000000000', 'diaper', now() - interval '1 h', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-e000-0000-0000-000000000001', 'bbbbbbbb-b000-0000-0000-000000000000', 'diaper', now() - interval '1 h', 'bbbbbbbb-0000-0000-0000-000000000001');
-- A1: one pending invite and one already used (history, kept).
insert into public.invites (id, family_id, code_hash, expires_at, used_at, used_by, created_by) values
  ('aaaaaaaa-1000-0000-0000-000000000001', 'aaaaaaaa-f000-0000-0000-000000000000', 'hash-pending', now() + interval '1 day', null, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-1000-0000-0000-000000000002', 'aaaaaaaa-f000-0000-0000-000000000000', 'hash-used', now() - interval '1 day', now() - interval '2 days', 'aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.checkins (family_id, user_id, day, answers) values
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, '{"mood": 3, "help": "a nap"}'),
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', current_date, '{"mood": 4, "help": "coffee"}');
insert into public.api_usage (user_id, function, window_start, count) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'chat', date_trunc('hour', now()), 3),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'chat', date_trunc('hour', now()), 2);
-- Shared ...01, A1 private ...02, A2 private ...03; family B shared ...04.
insert into public.chat_threads (id, family_id, owner_id) values
  ('aaaaaaaa-7000-0000-0000-000000000001', 'aaaaaaaa-f000-0000-0000-000000000000', null),
  ('aaaaaaaa-7000-0000-0000-000000000002', 'aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-7000-0000-0000-000000000003', 'aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-7000-0000-0000-000000000004', 'bbbbbbbb-f000-0000-0000-000000000000', null);

-- Rows written before reply_to existed, in the shared thread:
--   A1 asks (u1), reply r1                 -> r1 links to u1
--   A2 asks (u2), A1 asks (u3), reply r2   -> ambiguous, r2 stays null
--   A2 asks (u4), reply r3                 -> r3 links to u4
--   reply r4 with no user message before   -> stays null
insert into public.chat_messages (id, thread_id, role, content, author_id, created_at) values
  ('aaaaaaaa-0e00-0000-0000-000000000001', 'aaaaaaaa-7000-0000-0000-000000000001', 'user', 'u1', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '10 min'),
  ('aaaaaaaa-0e00-0000-0000-000000000002', 'aaaaaaaa-7000-0000-0000-000000000001', 'assistant', 'r1', null, now() - interval '9 min'),
  ('aaaaaaaa-0e00-0000-0000-000000000003', 'aaaaaaaa-7000-0000-0000-000000000001', 'user', 'u2', 'aaaaaaaa-0000-0000-0000-000000000002', now() - interval '8 min'),
  ('aaaaaaaa-0e00-0000-0000-000000000004', 'aaaaaaaa-7000-0000-0000-000000000001', 'user', 'u3', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '7 min'),
  ('aaaaaaaa-0e00-0000-0000-000000000005', 'aaaaaaaa-7000-0000-0000-000000000001', 'assistant', 'r2', null, now() - interval '6 min'),
  ('aaaaaaaa-0e00-0000-0000-000000000006', 'aaaaaaaa-7000-0000-0000-000000000001', 'user', 'u4', 'aaaaaaaa-0000-0000-0000-000000000002', now() - interval '5 min'),
  ('aaaaaaaa-0e00-0000-0000-000000000007', 'aaaaaaaa-7000-0000-0000-000000000001', 'assistant', 'r3', null, now() - interval '4 min'),
  ('aaaaaaaa-0e00-0000-0000-000000000008', 'aaaaaaaa-7000-0000-0000-000000000001', 'assistant', 'r4', null, now() - interval '3 min'),
  -- Private threads and family B.
  ('aaaaaaaa-0e00-0000-0000-000000000011', 'aaaaaaaa-7000-0000-0000-000000000002', 'user', 'A1 private', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '2 min'),
  ('aaaaaaaa-0e00-0000-0000-000000000012', 'aaaaaaaa-7000-0000-0000-000000000003', 'user', 'A2 private', 'aaaaaaaa-0000-0000-0000-000000000002', now() - interval '2 min'),
  ('bbbbbbbb-0e00-0000-0000-000000000001', 'bbbbbbbb-7000-0000-0000-000000000004', 'user', 'B shared', 'bbbbbbbb-0000-0000-0000-000000000001', now() - interval '2 min');
insert into public.thread_memory (thread_id, summary, covered_until) values
  ('aaaaaaaa-7000-0000-0000-000000000001', 'Shared summary.', now()),
  ('aaaaaaaa-7000-0000-0000-000000000002', 'A1 private summary.', now()),
  ('aaaaaaaa-7000-0000-0000-000000000003', 'A2 private summary.', now()),
  ('bbbbbbbb-7000-0000-0000-000000000004', 'B summary.', now());

-- ---- reply_to backfill ----------------------------------------------------------
select is(public.link_unlinked_replies(), 2, 'two assistant rows are left unlinked');
select results_eq(
  $$select id, reply_to from public.chat_messages
    where thread_id = 'aaaaaaaa-7000-0000-0000-000000000001' and role = 'assistant' order by created_at$$,
  $$values ('aaaaaaaa-0e00-0000-0000-000000000002'::uuid, 'aaaaaaaa-0e00-0000-0000-000000000001'::uuid),
           ('aaaaaaaa-0e00-0000-0000-000000000005'::uuid, null::uuid),
           ('aaaaaaaa-0e00-0000-0000-000000000007'::uuid, 'aaaaaaaa-0e00-0000-0000-000000000006'::uuid),
           ('aaaaaaaa-0e00-0000-0000-000000000008'::uuid, null::uuid)$$,
  'a reply links only to a lone user message right before it');

select throws_ok(
  $$insert into public.chat_messages (thread_id, role, content, author_id, reply_to)
    values ('aaaaaaaa-7000-0000-0000-000000000001', 'user', 'x', 'aaaaaaaa-0000-0000-0000-000000000001',
            'aaaaaaaa-0e00-0000-0000-000000000001')$$,
  '23514', null, 'only assistant rows carry reply_to');

-- The ambiguous reply r2 is linked by hand here, as a reviewer would, so the
-- partner path below shows that A2's turns keep their replies.
update public.chat_messages set reply_to = 'aaaaaaaa-0e00-0000-0000-000000000003'
  where id = 'aaaaaaaa-0e00-0000-0000-000000000005';

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$insert into public.chat_messages (thread_id, role, content, author_id, reply_to)
    values ('aaaaaaaa-7000-0000-0000-000000000001', 'assistant', 'x', 'aaaaaaaa-0000-0000-0000-000000000001',
            'aaaaaaaa-0e00-0000-0000-000000000006')$$,
  '42501', null, 'a client cannot write a reply linked to the partner''s turn');
select throws_ok(
  $$select public.delete_account_data('aaaaaaaa-0000-0000-0000-000000000002')$$,
  '42501', null, 'a parent cannot delete their partner through the RPC');

-- ---- one parent of two: A1 leaves ------------------------------------------------
select tests.as_postgres();
set local role service_role;
select is(public.delete_account_data('aaaaaaaa-0000-0000-0000-000000000001'), 'member_removed',
  'A1 is removed from a two-parent family');
reset role;

select is_empty($$select 1 from public.family_members where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'A1 membership is gone');
select is_empty($$select 1 from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'A1 profile is gone');
select is_empty($$select 1 from public.checkins where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'A1 check-ins are gone');
select is_empty($$select 1 from public.api_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'A1 rate-limit rows are gone');
select is_empty($$select 1 from public.chat_threads where id = 'aaaaaaaa-7000-0000-0000-000000000002'$$,
  'A1 private thread is gone');
select is_empty($$select 1 from public.thread_memory where thread_id = 'aaaaaaaa-7000-0000-0000-000000000002'$$,
  'A1 private summary is gone');
select is_empty($$select 1 from public.chat_messages where author_id = 'aaaaaaaa-0000-0000-0000-000000000001'$$,
  'no message authored by A1 remains');
select is_empty(
  $$select 1 from public.chat_messages
    where id in ('aaaaaaaa-0e00-0000-0000-000000000002')$$,
  'the reply to A1''s turn is gone with it');
select is_empty($$select 1 from public.thread_memory where thread_id = 'aaaaaaaa-7000-0000-0000-000000000001'$$,
  'the shared summary is dropped so it re-folds without A1');
select is_empty($$select 1 from public.invites where id = 'aaaaaaaa-1000-0000-0000-000000000001'$$,
  'A1 pending invite is gone');
select isnt_empty($$select 1 from public.invites where id = 'aaaaaaaa-1000-0000-0000-000000000002'$$,
  'the used invite stays');
select is(
  (select created_by from public.events where id = 'aaaaaaaa-e000-0000-0000-000000000001'), null,
  'A1 event stays, without its author');

-- The partner's data is intact.
select results_eq(
  $$select id from public.chat_messages where thread_id = 'aaaaaaaa-7000-0000-0000-000000000001' order by created_at$$,
  $$values ('aaaaaaaa-0e00-0000-0000-000000000003'::uuid), ('aaaaaaaa-0e00-0000-0000-000000000005'::uuid),
           ('aaaaaaaa-0e00-0000-0000-000000000006'::uuid), ('aaaaaaaa-0e00-0000-0000-000000000007'::uuid),
           ('aaaaaaaa-0e00-0000-0000-000000000008'::uuid)$$,
  'A2 shared-thread turns and their replies stay');
select isnt_empty($$select 1 from public.chat_messages where id = 'aaaaaaaa-0e00-0000-0000-000000000012'$$,
  'A2 private thread stays');
select isnt_empty($$select 1 from public.thread_memory where thread_id = 'aaaaaaaa-7000-0000-0000-000000000003'$$,
  'A2 private summary stays');
select is(
  (select created_by from public.events where id = 'aaaaaaaa-e000-0000-0000-000000000002'),
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'A2 event keeps its author');
select isnt_empty($$select 1 from public.checkins where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'$$,
  'A2 check-in stays');
select isnt_empty($$select 1 from public.api_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'$$,
  'A2 rate-limit rows stay');

-- ---- last member: A2 leaves --------------------------------------------------------
set local role service_role;
select is(public.delete_account_data('aaaaaaaa-0000-0000-0000-000000000002'), 'family_deleted',
  'the last member takes the family with them');
reset role;

select is(
  (select count(*)::int from public.families f where f.id = 'aaaaaaaa-f000-0000-0000-000000000000')
  + (select count(*)::int from public.babies where family_id = 'aaaaaaaa-f000-0000-0000-000000000000')
  + (select count(*)::int from public.events where baby_id = 'aaaaaaaa-b000-0000-0000-000000000000')
  + (select count(*)::int from public.invites where family_id = 'aaaaaaaa-f000-0000-0000-000000000000')
  + (select count(*)::int from public.chat_threads where family_id = 'aaaaaaaa-f000-0000-0000-000000000000')
  + (select count(*)::int from public.chat_messages where thread_id::text like 'aaaaaaaa-7000-%')
  + (select count(*)::int from public.thread_memory where thread_id::text like 'aaaaaaaa-7000-%')
  + (select count(*)::int from public.checkins where family_id = 'aaaaaaaa-f000-0000-0000-000000000000')
  + (select count(*)::int from public.api_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000002')
  + (select count(*)::int from public.profiles where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0, 'nothing of family A remains');

select is(
  (select count(*)::int from public.chat_messages where thread_id = 'bbbbbbbb-7000-0000-0000-000000000004')
  + (select count(*)::int from public.thread_memory where thread_id = 'bbbbbbbb-7000-0000-0000-000000000004')
  + (select count(*)::int from public.events where baby_id = 'bbbbbbbb-b000-0000-0000-000000000000'),
  3, 'family B is untouched');

set local role service_role;
select is(public.delete_account_data('aaaaaaaa-0000-0000-0000-000000000002'), 'no_family',
  'running it again is a no-op');
reset role;

select * from finish();
rollback;
