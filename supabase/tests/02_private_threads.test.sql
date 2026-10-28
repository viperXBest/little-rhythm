-- Private threads are readable and writable only by their owner.
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

grant execute on all functions in schema tests to anon, authenticated;

select tests.create_user('aaaaaaaa-0000-0000-0000-000000000001', 'A1');
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000002', 'A2');
select tests.create_user('bbbbbbbb-0000-0000-0000-000000000001', 'B1');

insert into public.families (id) values
  ('aaaaaaaa-f000-0000-0000-000000000000'),
  ('bbbbbbbb-f000-0000-0000-000000000000');
insert into public.family_members (family_id, user_id) values
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-f000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001');
-- Family A: shared thread ...01 and A1's private thread ...02.
insert into public.chat_threads (id, family_id, owner_id) values
  ('aaaaaaaa-7000-0000-0000-000000000001', 'aaaaaaaa-f000-0000-0000-000000000000', null),
  ('aaaaaaaa-7000-0000-0000-000000000002', 'aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.chat_messages (thread_id, role, content, author_id) values
  ('aaaaaaaa-7000-0000-0000-000000000001', 'user', 'shared hello', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('aaaaaaaa-7000-0000-0000-000000000002', 'user', 'private note', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-7000-0000-0000-000000000002', 'assistant', 'private reply', null);

select plan(14);

-- ---- Owner ----------------------------------------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is((select count(*)::int from public.chat_threads), 2, 'A1 sees the shared and their private thread');
select is((select count(*)::int from public.chat_messages), 3, 'A1 sees all messages in both threads');
select lives_ok(
  $$insert into public.chat_messages (thread_id, role, content, author_id) values ('aaaaaaaa-7000-0000-0000-000000000002', 'user', 'more', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  'A1 can post into their private thread');
select throws_ok(
  $$insert into public.chat_messages (thread_id, role, content, author_id) values ('aaaaaaaa-7000-0000-0000-000000000002', 'assistant', 'fake', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'clients cannot write assistant messages');
select throws_ok(
  $$insert into public.chat_messages (thread_id, role, content, author_id) values ('aaaaaaaa-7000-0000-0000-000000000001', 'user', 'spoof', 'aaaaaaaa-0000-0000-0000-000000000002')$$,
  '42501', null, 'A1 cannot post as the partner');
select is_empty(
  $$update public.chat_threads set owner_id = null where id = 'aaaaaaaa-7000-0000-0000-000000000002' returning id$$,
  'a private thread cannot be turned shared');

-- ---- Partner in the same family -------------------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select results_eq('select id from public.chat_threads', $$values ('aaaaaaaa-7000-0000-0000-000000000001'::uuid)$$, 'A2 sees only the shared thread');
select results_eq('select content from public.chat_messages', $$values ('shared hello')$$, 'A2 sees no private messages');
select throws_ok(
  $$insert into public.chat_messages (thread_id, role, content, author_id) values ('aaaaaaaa-7000-0000-0000-000000000002', 'user', 'peek', 'aaaaaaaa-0000-0000-0000-000000000002')$$,
  '42501', null, 'A2 cannot post into A1''s private thread');
select throws_ok(
  $$insert into public.chat_threads (family_id, owner_id) values ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'A2 cannot create a thread owned by A1');
select lives_ok(
  $$insert into public.chat_threads (id, family_id, owner_id) values ('aaaaaaaa-7000-0000-0000-000000000003', 'aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002')$$,
  'A2 can create their own private thread');

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is_empty(
  $$select 1 from public.chat_threads where id = 'aaaaaaaa-7000-0000-0000-000000000003'$$,
  'A1 cannot see A2''s private thread');

-- ---- Other family -----------------------------------------------------------
select tests.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select is_empty('select 1 from public.chat_threads', 'B1 sees no family A threads');
select throws_ok(
  $$insert into public.chat_messages (thread_id, role, content, author_id) values ('aaaaaaaa-7000-0000-0000-000000000001', 'user', 'hi', 'bbbbbbbb-0000-0000-0000-000000000001')$$,
  '42501', null, 'B1 cannot post into family A''s shared thread');

select * from finish();
rollback;
