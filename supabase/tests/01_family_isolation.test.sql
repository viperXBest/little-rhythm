-- A user in family A cannot read or write family B.
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

-- SET ROLE is checked against the session user (postgres), so switching back works.
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

-- Seed (as postgres, bypassing RLS).
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000001', 'A1');
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000002', 'A2');
select tests.create_user('bbbbbbbb-0000-0000-0000-000000000001', 'B1');
select tests.create_user('cccccccc-0000-0000-0000-000000000001', 'C1');

insert into public.families (id, created_by) values
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-f000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into public.family_members (family_id, user_id) values
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-f000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into public.babies (id, family_id, name, birth_date) values
  ('aaaaaaaa-b000-0000-0000-000000000000', 'aaaaaaaa-f000-0000-0000-000000000000', 'Baby A', current_date - 60),
  ('bbbbbbbb-b000-0000-0000-000000000000', 'bbbbbbbb-f000-0000-0000-000000000000', 'Baby B', current_date - 30);
insert into public.events (id, baby_id, type, started_at, created_by) values
  ('aaaaaaaa-e000-0000-0000-000000000000', 'aaaaaaaa-b000-0000-0000-000000000000', 'feed', now() - interval '2 hours', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-e000-0000-0000-000000000000', 'bbbbbbbb-b000-0000-0000-000000000000', 'feed', now() - interval '1 hour', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into public.invites (family_id, code_hash, expires_at, created_by) values
  ('bbbbbbbb-f000-0000-0000-000000000000', 'hash-b', now() + interval '1 day', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into public.chat_threads (id, family_id) values
  ('bbbbbbbb-7000-0000-0000-000000000000', 'bbbbbbbb-f000-0000-0000-000000000000');
insert into public.chat_messages (thread_id, role, content, author_id) values
  ('bbbbbbbb-7000-0000-0000-000000000000', 'user', 'hello', 'bbbbbbbb-0000-0000-0000-000000000001');
insert into public.checkins (family_id, user_id, day, answers) values
  ('bbbbbbbb-f000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', current_date, '{"q1":"ok"}');

select plan(30);

-- ---- Reads: A1 sees family A, nothing of family B ------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');

select results_eq('select id from public.families', $$values ('aaaaaaaa-f000-0000-0000-000000000000'::uuid)$$, 'A1 sees only family A');
select is((select count(*)::int from public.family_members), 2, 'A1 sees the two members of family A');
select results_eq('select id from public.babies', $$values ('aaaaaaaa-b000-0000-0000-000000000000'::uuid)$$, 'A1 sees only baby A');
select results_eq('select id from public.events', $$values ('aaaaaaaa-e000-0000-0000-000000000000'::uuid)$$, 'A1 sees only family A events (including the partner''s)');
select is_empty('select 1 from public.invites', 'A1 cannot see family B invites');
select is_empty('select 1 from public.chat_threads', 'A1 cannot see family B threads');
select is_empty('select 1 from public.chat_messages', 'A1 cannot see family B messages');
select is_empty('select 1 from public.checkins', 'A1 cannot see family B check-ins');
select results_eq('select display_name from public.profiles order by display_name', $$values ('A1'), ('A2')$$, 'A1 sees own and partner profile only');

-- ---- Writes into family B are rejected ------------------------------------
select throws_ok(
  $$insert into public.events (baby_id, type, started_at) values ('bbbbbbbb-b000-0000-0000-000000000000', 'feed', now())$$,
  '42501', null, 'A1 cannot insert an event for baby B');
select is_empty(
  $$update public.events set details = '{"ml":1}' where id = 'bbbbbbbb-e000-0000-0000-000000000000' returning id$$,
  'A1 cannot update a family B event');
select is_empty(
  $$delete from public.events where id = 'bbbbbbbb-e000-0000-0000-000000000000' returning id$$,
  'A1 cannot delete a family B event');
select is_empty(
  $$update public.babies set name = 'x' where id = 'bbbbbbbb-b000-0000-0000-000000000000' returning id$$,
  'A1 cannot rename baby B');
select throws_ok(
  $$insert into public.family_members (family_id, user_id) values ('bbbbbbbb-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'A1 cannot add themselves to family B');
select throws_ok(
  $$insert into public.babies (family_id, name, birth_date) values ('bbbbbbbb-f000-0000-0000-000000000000', 'x', current_date)$$,
  '42501', null, 'A1 cannot add a baby to family B');
select throws_ok(
  $$insert into public.chat_messages (thread_id, role, content, author_id) values ('bbbbbbbb-7000-0000-0000-000000000000', 'user', 'hi', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null, 'A1 cannot post into a family B thread');
select throws_ok(
  $$insert into public.checkins (family_id, user_id, day, answers) values ('bbbbbbbb-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, '{}')$$,
  '42501', null, 'A1 cannot check in to family B');
select throws_ok(
  $$insert into public.invites (family_id, code_hash, expires_at) values ('aaaaaaaa-f000-0000-0000-000000000000', 'x', now() + interval '1 day')$$,
  '42501', null, 'clients cannot create invites directly');
select throws_ok(
  $$insert into public.api_usage (user_id, function, window_start, count) values ('aaaaaaaa-0000-0000-0000-000000000001', 'pair', now(), -100)$$,
  '42501', null, 'clients cannot reset their rate-limit counters');

-- ---- Own family: allowed, with integrity checks ---------------------------
select lives_ok(
  $$insert into public.events (id, baby_id, type, started_at) values ('aaaaaaaa-e000-0000-0000-000000000001', 'aaaaaaaa-b000-0000-0000-000000000000', 'sleep', now())$$,
  'A1 can log an event for baby A');
select throws_ok(
  $$insert into public.events (baby_id, type, started_at, created_by) values ('aaaaaaaa-b000-0000-0000-000000000000', 'feed', now(), 'aaaaaaaa-0000-0000-0000-000000000002')$$,
  '42501', null, 'A1 cannot log an event as the partner');
select throws_ok(
  $$update public.events set baby_id = 'bbbbbbbb-b000-0000-0000-000000000000' where id = 'aaaaaaaa-e000-0000-0000-000000000001'$$,
  '42501', null, 'A1 cannot move an event to baby B');
select isnt_empty(
  $$update public.events set ended_at = now() where id = 'aaaaaaaa-e000-0000-0000-000000000000' returning id$$,
  'A1 can edit the partner''s event in the same family');
select throws_ok(
  $$select public.create_family('Second', current_date)$$,
  'P0001', 'already_in_family', 'A1 cannot create a second family');

-- ---- A user without a family can create one -------------------------------
select tests.as_user('cccccccc-0000-0000-0000-000000000001');
select isnt(public.create_family('Baby C', current_date - 7), null, 'C1 creates a family');
select results_eq('select name from public.babies', $$values ('Baby C')$$, 'C1 sees only their new baby');
select throws_ok(
  $$select public.create_family('Too old', current_date - interval '4 years')$$,
  null, null, 'create_family rejects a birth date out of range');

-- ---- anon gets nothing ----------------------------------------------------
select tests.as_anon();
select throws_ok('select 1 from public.events', '42501', null, 'anon cannot read events');
select throws_ok($$select public.create_family('x', current_date)$$, '42501', null, 'anon cannot call create_family');

-- ---- B's data is untouched ------------------------------------------------
select tests.as_postgres();
select results_eq(
  $$select details, name from public.events e join public.babies b on b.id = e.baby_id where e.id = 'bbbbbbbb-e000-0000-0000-000000000000'$$,
  $$values ('{}'::jsonb, 'Baby B')$$,
  'family B rows are unchanged');

select * from finish();
rollback;
