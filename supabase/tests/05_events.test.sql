-- Events: partner CRUD, family isolation, immutable columns, one open sleep,
-- and the realtime publication (chat and check-in RLS: 02 and 03).
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
insert into public.babies (id, family_id, name, birth_date) values
  ('aaaaaaaa-b000-0000-0000-000000000000', 'aaaaaaaa-f000-0000-0000-000000000000', 'Baby A', current_date - 60),
  ('bbbbbbbb-b000-0000-0000-000000000000', 'bbbbbbbb-f000-0000-0000-000000000000', 'Baby B', current_date - 30);
-- A1's feed ...01 and finished sleep ...02.
insert into public.events (id, baby_id, type, started_at, ended_at, details, created_by) values
  ('aaaaaaaa-e000-0000-0000-000000000001', 'aaaaaaaa-b000-0000-0000-000000000000', 'feed',
   now() - interval '3 hours', null, '{"kind":"bottle","ml":90}', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-e000-0000-0000-000000000002', 'aaaaaaaa-b000-0000-0000-000000000000', 'sleep',
   now() - interval '5 hours', now() - interval '4 hours', '{}', 'aaaaaaaa-0000-0000-0000-000000000001');

select plan(27);

-- ---- Partner A2: full CRUD on A1's events ---------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');

select is((select count(*)::int from public.events), 2, 'A2 reads A1''s events');
select lives_ok(
  $$insert into public.events (id, baby_id, type, started_at, details) values
    ('aaaaaaaa-e000-0000-0000-000000000003', 'aaaaaaaa-b000-0000-0000-000000000000', 'diaper', now(), '{"wet":true,"dirty":false}')$$,
  'A2 inserts an event');
select is(
  (select created_by from public.events where id = 'aaaaaaaa-e000-0000-0000-000000000003'),
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'created_by defaults to the caller');
select isnt_empty(
  $$update public.events set ended_at = now() where id = 'aaaaaaaa-e000-0000-0000-000000000001' returning id$$,
  'A2 updates ended_at alone on A1''s event');
select isnt_empty(
  $$update public.events set started_at = now() - interval '150 minutes', details = '{"kind":"bottle","ml":120}'
    where id = 'aaaaaaaa-e000-0000-0000-000000000001' returning id$$,
  'A2 edits started_at and details on A1''s event');
select isnt_empty(
  $$delete from public.events where id = 'aaaaaaaa-e000-0000-0000-000000000003' returning id$$,
  'A2 deletes an event');

-- ---- Immutable columns ----------------------------------------------------
select throws_ok(
  $$update public.events set type = 'diaper' where id = 'aaaaaaaa-e000-0000-0000-000000000001'$$,
  '42501', null, 'type cannot be changed');
select throws_ok(
  $$update public.events set created_by = 'aaaaaaaa-0000-0000-0000-000000000001' where id = 'aaaaaaaa-e000-0000-0000-000000000001'$$,
  '42501', null, 'created_by cannot be rewritten');
select throws_ok(
  $$update public.events set source = 'voice' where id = 'aaaaaaaa-e000-0000-0000-000000000001'$$,
  '42501', null, 'source cannot be changed');
select throws_ok(
  $$update public.events set baby_id = 'bbbbbbbb-b000-0000-0000-000000000000' where id = 'aaaaaaaa-e000-0000-0000-000000000001'$$,
  '42501', null, 'an event cannot be moved to another family''s baby');
select throws_ok(
  $$update public.events set ended_at = started_at - interval '1 minute' where id = 'aaaaaaaa-e000-0000-0000-000000000001'$$,
  '23514', null, 'ended_at before started_at is rejected');

-- ---- Insert integrity -----------------------------------------------------
select throws_ok(
  $$insert into public.events (baby_id, type, started_at, created_by) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'feed', now(), 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'A2 cannot insert as A1 (spoofed created_by)');
select throws_ok(
  $$insert into public.events (baby_id, type, started_at, created_by) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'feed', now(), null)$$,
  '42501', null, 'created_by cannot be null');
select throws_ok(
  $$insert into public.events (baby_id, type, started_at) values ('bbbbbbbb-b000-0000-0000-000000000000', 'feed', now())$$,
  '42501', null, 'A2 cannot insert with another family''s baby_id');

-- ---- One open sleep per baby ----------------------------------------------
select lives_ok(
  $$insert into public.events (id, baby_id, type, started_at) values
    ('aaaaaaaa-e000-0000-0000-000000000004', 'aaaaaaaa-b000-0000-0000-000000000000', 'sleep', now() - interval '10 minutes')$$,
  'A2 starts a sleep');
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select throws_ok(
  $$insert into public.events (baby_id, type, started_at) values ('aaaaaaaa-b000-0000-0000-000000000000', 'sleep', now())$$,
  '23505', null, 'A1 cannot start a second open sleep');
select lives_ok(
  $$insert into public.events (baby_id, type, started_at, ended_at) values
    ('aaaaaaaa-b000-0000-0000-000000000000', 'sleep', now() - interval '9 hours', now() - interval '8 hours')$$,
  'a closed sleep can be logged while one is open');
select isnt_empty(
  $$update public.events set ended_at = now() where id = 'aaaaaaaa-e000-0000-0000-000000000004' and ended_at is null returning id$$,
  'A1 stops the partner''s sleep');
select lives_ok(
  $$insert into public.events (baby_id, type, started_at) values ('aaaaaaaa-b000-0000-0000-000000000000', 'sleep', now())$$,
  'a new sleep can start once the previous one is closed');

-- ---- Other family: nothing ------------------------------------------------
select tests.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select is_empty('select 1 from public.events', 'B1 sees no family A events');
select throws_ok(
  $$insert into public.events (baby_id, type, started_at) values ('aaaaaaaa-b000-0000-0000-000000000000', 'feed', now())$$,
  '42501', null, 'B1 cannot insert for baby A');
select is_empty(
  $$update public.events set ended_at = now() where id = 'aaaaaaaa-e000-0000-0000-000000000002' returning id$$,
  'B1 cannot update a family A event');
select is_empty(
  $$delete from public.events where id = 'aaaaaaaa-e000-0000-0000-000000000002' returning id$$,
  'B1 cannot delete a family A event');
select lives_ok(
  $$insert into public.events (baby_id, type, started_at) values ('bbbbbbbb-b000-0000-0000-000000000000', 'sleep', now())$$,
  'B1 can have an open sleep while baby A has one');

-- ---- Family A untouched by B1; realtime publication ------------------------
select tests.as_postgres();
select results_eq(
  $$select ended_at from public.events where id = 'aaaaaaaa-e000-0000-0000-000000000002'$$,
  $$select now() - interval '4 hours'$$,
  'family A sleep is unchanged');
select set_eq(
  $$select tablename::text from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('events', 'family_members', 'chat_messages', 'checkins')$$,
  array['events', 'family_members', 'chat_messages', 'checkins'],
  'events, family_members, chat_messages and checkins are in the realtime publication');
select is_empty(
  $$select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('chat_threads', 'invites', 'api_usage', 'profiles', 'babies', 'families', 'thread_memory')$$,
  'other tables are not in the realtime publication');

select * from finish();
rollback;
