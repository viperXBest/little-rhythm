-- A partner's check-in answers stay hidden until you answered the same day.
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
-- A2 answered today and yesterday; B1 answered today in family B.
insert into public.checkins (family_id, user_id, day, answers) values
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', current_date, '{"q1":"tired"}'),
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', current_date - 1, '{"q1":"good"}'),
  ('bbbbbbbb-f000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001', current_date, '{"q1":"fine"}');

select plan(10);

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is_empty('select 1 from public.checkins', 'A1 sees no partner answers before answering');
select ok(not public.has_checked_in('aaaaaaaa-f000-0000-0000-000000000000', current_date), 'has_checked_in is false before answering');

select throws_ok(
  $$insert into public.checkins (family_id, user_id, day, answers) values ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002', current_date - 2, '{}')$$,
  '42501', null, 'A1 cannot answer on the partner''s behalf');
select throws_ok(
  $$insert into public.checkins (family_id, user_id, day, answers) values ('bbbbbbbb-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, '{}')$$,
  '42501', null, 'A1 cannot answer in another family');

select lives_ok(
  $$insert into public.checkins (family_id, user_id, day, answers) values ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, '{"q1":"ok"}')$$,
  'A1 answers today');
select results_eq(
  $$select answers from public.checkins where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'$$,
  $$values ('{"q1":"tired"}'::jsonb)$$,
  'after answering, A1 sees A2''s answer for today only (not yesterday)');
select is_empty(
  $$update public.checkins set answers = '{"q1":"changed"}' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning id$$,
  'answers cannot be edited after submitting');
select throws_ok(
  $$insert into public.checkins (family_id, user_id, day, answers) values ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001', current_date, '{"q1":"again"}')$$,
  '23505', null, 'one answer per person per day');

-- B1 answered today too, but in a different family.
select tests.as_user('bbbbbbbb-0000-0000-0000-000000000001');
select results_eq(
  'select user_id from public.checkins',
  $$values ('bbbbbbbb-0000-0000-0000-000000000001'::uuid)$$,
  'B1 sees only their own check-in');

select tests.as_user('aaaaaaaa-0000-0000-0000-000000000002');
select is((select count(*)::int from public.checkins), 3, 'A2 sees both own answers plus A1''s today');

select * from finish();
rollback;
