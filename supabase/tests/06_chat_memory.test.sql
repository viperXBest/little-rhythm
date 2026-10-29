-- Chat memory: gated turns are server-only, thread_memory follows thread
-- visibility and is server-written, and search is RLS-scoped, skips gated and
-- escalation rows, and ignores diacritics.
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

create function tests.as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
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
-- Family A: shared thread ...01, A1's private thread ...02. Family B: shared ...03.
insert into public.chat_threads (id, family_id, owner_id) values
  ('aaaaaaaa-7000-0000-0000-000000000001', 'aaaaaaaa-f000-0000-0000-000000000000', null),
  ('aaaaaaaa-7000-0000-0000-000000000002', 'aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-7000-0000-0000-000000000003', 'bbbbbbbb-f000-0000-0000-000000000000', null);

insert into public.chat_messages (thread_id, role, content, author_id, gated, escalation, created_at) values
  -- Shared thread: two plain messages, one gated question and its escalation.
  ('aaaaaaaa-7000-0000-0000-000000000001', 'user', 'Ieri a avut un pic de febra dupa plimbare', 'aaaaaaaa-0000-0000-0000-000000000002', false, null, now() - interval '5 min'),
  ('aaaaaaaa-7000-0000-0000-000000000001', 'user', 'Ea iubește băița de seară cu cântecele', 'aaaaaaaa-0000-0000-0000-000000000001', false, null, now() - interval '4 min'),
  ('aaaaaaaa-7000-0000-0000-000000000001', 'user', 'cât nurofen pentru febra asta?', 'aaaaaaaa-0000-0000-0000-000000000001', true, null, now() - interval '3 min'),
  ('aaaaaaaa-7000-0000-0000-000000000001', 'assistant', 'febra escalation text', null, false, 'health', now() - interval '2 min'),
  -- A1's private thread.
  ('aaaaaaaa-7000-0000-0000-000000000002', 'user', 'febra secret note', 'aaaaaaaa-0000-0000-0000-000000000001', false, null, now() - interval '1 min'),
  -- Family B.
  ('bbbbbbbb-7000-0000-0000-000000000003', 'user', 'febra in family B', 'bbbbbbbb-0000-0000-0000-000000000001', false, null, now());
-- Twelve matching rows for the limit clamp.
insert into public.chat_messages (thread_id, role, content, author_id)
  select 'aaaaaaaa-7000-0000-0000-000000000001', 'user', 'plimbare in parc ' || g, 'aaaaaaaa-0000-0000-0000-000000000001'
  from generate_series(1, 12) g;

insert into public.thread_memory (thread_id, summary, covered_until) values
  ('aaaaaaaa-7000-0000-0000-000000000001', 'Bath at 19:00 with songs.', now()),
  ('aaaaaaaa-7000-0000-0000-000000000002', 'A1 private memory.', now()),
  ('bbbbbbbb-7000-0000-0000-000000000003', 'Family B memory.', now());

select plan(20);

-- ---- gated is server-only ------------------------------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$insert into public.chat_messages (thread_id, role, content, author_id, gated) values ('aaaaaaaa-7000-0000-0000-000000000001', 'user', 'hi', 'aaaaaaaa-0000-0000-0000-000000000001', true)$$,
  '42501', null, 'clients cannot insert a gated row');
select throws_ok(
  $$update public.chat_messages set gated = false where thread_id = 'aaaaaaaa-7000-0000-0000-000000000001'$$,
  '42501', null, 'clients cannot update messages (gated included)');
select throws_ok(
  $$insert into public.chat_messages (thread_id, role, content, author_id) values ('aaaaaaaa-7000-0000-0000-000000000001', 'user', 'plain', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'clients cannot insert a plain user row either (it would skip the health gate)');

-- ---- thread_memory visibility ------------------------------------------------
select set_eq(
  'select summary from public.thread_memory',
  array['Bath at 19:00 with songs.', 'A1 private memory.'],
  'A1 sees the shared memory and their own private memory');
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select results_eq(
  'select summary from public.thread_memory',
  $$values ('Bath at 19:00 with songs.')$$,
  'A2 sees the shared memory only, not A1''s private memory');
select tests.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select results_eq(
  'select summary from public.thread_memory',
  $$values ('Family B memory.')$$,
  'B1 sees only family B''s memory');

-- ---- thread_memory is server-written -----------------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$insert into public.thread_memory (thread_id, summary, covered_until) values ('aaaaaaaa-7000-0000-0000-000000000001', 'x', now()) on conflict do nothing$$,
  '42501', null, 'clients cannot insert memory');
select throws_ok(
  $$update public.thread_memory set summary = 'changed'$$,
  '42501', null, 'clients cannot update memory');
select throws_ok(
  $$delete from public.thread_memory$$,
  '42501', null, 'clients cannot delete memory');

-- ---- search ---------------------------------------------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select results_eq(
  $$select content from public.search_thread_messages('aaaaaaaa-7000-0000-0000-000000000001', 'febră', 10)$$,
  $$values ('Ieri a avut un pic de febra dupa plimbare')$$,
  '"febră" finds "febra"; the gated question and the escalation row are skipped');
select results_eq(
  $$select content from public.search_thread_messages('aaaaaaaa-7000-0000-0000-000000000001', 'baita', 10)$$,
  $$values ('Ea iubește băița de seară cu cântecele')$$,
  '"baita" finds "băiță"');
select is_empty(
  $$select 1 from public.search_thread_messages('aaaaaaaa-7000-0000-0000-000000000001', 'nurofen', 10)$$,
  'a gated message is never returned');
select is_empty(
  $$select 1 from public.search_thread_messages('aaaaaaaa-7000-0000-0000-000000000001', 'escalation', 10)$$,
  'an escalation row is never returned');
select is_empty(
  $$select 1 from public.search_thread_messages('aaaaaaaa-7000-0000-0000-000000000002', 'febra', 10)$$,
  'the partner gets nothing from A1''s private thread');
select is(
  (select count(*)::int from public.search_thread_messages('aaaaaaaa-7000-0000-0000-000000000001', 'plimbare parc', 100)),
  10, 'the limit is capped at 10');
select is(
  (select count(*)::int from public.search_thread_messages('aaaaaaaa-7000-0000-0000-000000000001', 'plimbare parc', 0)),
  1, 'a limit below 1 returns 1');

select tests.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select is_empty(
  $$select 1 from public.search_thread_messages('aaaaaaaa-7000-0000-0000-000000000001', 'febra', 10)$$,
  'another family gets nothing from family A''s shared thread');

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select results_eq(
  $$select content from public.search_thread_messages('aaaaaaaa-7000-0000-0000-000000000002', 'FEBRA', 10)$$,
  $$values ('febra secret note')$$,
  'the owner searches their private thread, case-insensitively');

select tests.as_anon();
select throws_ok(
  $$select * from public.search_thread_messages('aaaaaaaa-7000-0000-0000-000000000001', 'febra', 10)$$,
  '42501', null, 'anon cannot search');

-- ---- publication -------------------------------------------------------------
select tests.as_postgres();
select is_empty(
  $$select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'thread_memory'$$,
  'thread_memory is not in the realtime publication');

select * from finish();
rollback;
