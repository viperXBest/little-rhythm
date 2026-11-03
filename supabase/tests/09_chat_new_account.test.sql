-- The new-account chat cap (v1.1.1): consume_chat_budget with p_new_account_max and
-- p_new_account_seconds. Accounts younger than the window get the smaller daily cap;
-- older ones get the normal per-user cap. The 5-argument v1.1.0 signature stays as a
-- wrapper without the new-account cap. Caps here are small test values.
begin;
create extension if not exists pgtap with schema extensions;

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.create_user(p_id uuid, p_created timestamptz) returns void
language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_id::text || '@test.local', '{}'::jsonb, p_created, p_created);
$$;

create function tests.as_user(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- user cap 5, new-account cap 2 for accounts under an hour old, generous family and global caps.
create function tests.budget(p_user uuid) returns text language sql as $$
  select outcome from public.consume_chat_budget(p_user, 5, 100, 1000000, 10, 2, 3600)
$$;

create function tests.budget_v110(p_user uuid) returns text language sql as $$
  select outcome from public.consume_chat_budget(p_user, 5, 100, 1000000, 10)
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- New (just signed up), old (two hours ago, e.g. a re-seeded demo account), and new for the wrapper.
select tests.create_user('dddddddd-0000-0000-0000-000000000001', now());
select tests.create_user('dddddddd-0000-0000-0000-000000000002', now() - interval '2 hours');
select tests.create_user('dddddddd-0000-0000-0000-000000000003', now() - interval '59 minutes');
select tests.create_user('dddddddd-0000-0000-0000-000000000004', now());

insert into public.families (id) values
  ('dddddddd-f000-0000-0000-000000000001'),
  ('dddddddd-f000-0000-0000-000000000002'),
  ('dddddddd-f000-0000-0000-000000000003'),
  ('dddddddd-f000-0000-0000-000000000004');
insert into public.family_members (family_id, user_id) values
  ('dddddddd-f000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001'),
  ('dddddddd-f000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000002'),
  ('dddddddd-f000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000003'),
  ('dddddddd-f000-0000-0000-000000000004', 'dddddddd-0000-0000-0000-000000000004');

delete from public.usage_counters where scope = 'global';

select plan(15);

-- ---- a new account: 2 turns, then new_account -----------------------------
select is(tests.budget('dddddddd-0000-0000-0000-000000000001'), 'ok', 'new account: turn 1 ok');
select is(tests.budget('dddddddd-0000-0000-0000-000000000001'), 'ok', 'new account: turn 2 ok');
select is(tests.budget('dddddddd-0000-0000-0000-000000000001'), 'new_account',
  'new account: turn 3 is over the new-account cap');
select is(
  (select count from public.api_usage where user_id = 'dddddddd-0000-0000-0000-000000000001'
     and function = 'chat_day'),
  3, 'the new-account count is the same chat_day counter as the per-user cap');
select is(
  (select count from public.usage_counters where family_id = 'dddddddd-f000-0000-0000-000000000001'),
  2::bigint, 'a refused new-account turn does not count against the family');
select is(
  (select count from public.usage_counters where scope = 'global'),
  20::bigint, 'a refused new-account turn reserves nothing globally');

-- ---- 59 minutes old is still new; two hours old is not ------------------------
select is(tests.budget('dddddddd-0000-0000-0000-000000000003'), 'ok', '59 min old: turn 1 ok');
select is(tests.budget('dddddddd-0000-0000-0000-000000000003'), 'ok', '59 min old: turn 2 ok');
select is(tests.budget('dddddddd-0000-0000-0000-000000000003'), 'new_account', '59 min old: still capped');

select is(
  (select array_agg(tests.budget('dddddddd-0000-0000-0000-000000000002')) from generate_series(1, 6)),
  array['ok', 'ok', 'ok', 'ok', 'ok', 'user'],
  'an account older than an hour gets the normal per-user cap (5), refused as user');

-- ---- the v1.1.0 signature: no new-account cap ------------------------------
select is(
  (select array_agg(tests.budget_v110('dddddddd-0000-0000-0000-000000000004')) from generate_series(1, 6)),
  array['ok', 'ok', 'ok', 'ok', 'ok', 'user'],
  'the 5-argument wrapper (chat v9) applies only the per-user cap');

-- ---- argument checks and access ----------------------------------------------
select throws_ok(
  $$select public.consume_chat_budget('dddddddd-0000-0000-0000-000000000002', 5, 100, 1000000, 10, -1, 3600)$$,
  '22023', 'invalid_new_account_cap', 'a negative new-account cap is rejected');
select throws_ok(
  $$select public.consume_chat_budget('dddddddd-0000-0000-0000-000000000002', 5, 100, 1000000, 10, 2, 0)$$,
  '22023', 'invalid_new_account_cap', 'a new-account window of zero is rejected');

select tests.as_user('dddddddd-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.consume_chat_budget('dddddddd-0000-0000-0000-000000000001', 1000, 1000, 1000000, 0, 1000, 1)$$,
  '42501', null, 'clients cannot call the 7-argument consume_chat_budget');
select throws_ok(
  $$select public.consume_chat_budget('dddddddd-0000-0000-0000-000000000001', 1000, 1000, 1000000, 0)$$,
  '42501', null, 'clients cannot call the 5-argument wrapper either');

select * from finish();
rollback;
