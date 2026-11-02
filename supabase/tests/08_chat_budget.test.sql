-- Daily chat caps and the global spend breaker (consume_chat_budget, settle_chat_spend).
-- Both run as the service role (here: postgres) from the chat Edge Function.
-- Caps here are small test values; the real ones are in _shared/chat-limits.ts.
begin;
create extension if not exists pgtap with schema extensions;

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.create_user(p_id uuid) returns void
language sql as $$
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          p_id::text || '@test.local', '{}'::jsonb, now(), now());
$$;

create function tests.as_user(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- consume_chat_budget(user, user_max, family_max, global_max, reserve) -> outcome
create function tests.budget(p_user uuid, p_user_max int, p_family_max int, p_global_max bigint, p_reserve bigint)
returns text language sql as $$
  select outcome from public.consume_chat_budget(p_user, p_user_max, p_family_max, p_global_max, p_reserve)
$$;

create function tests.global_spend() returns bigint language sql as $$
  select coalesce((select count from public.usage_counters
    where scope = 'global' and function = 'chat_spend'
      and window_start = to_timestamp(floor(extract(epoch from now()) / 86400) * 86400)), 0)
$$;

create function tests.family_turns(p_family uuid) returns bigint language sql as $$
  select coalesce((select count from public.usage_counters
    where scope = 'family' and family_id = p_family and function = 'chat'
      and window_start = to_timestamp(floor(extract(epoch from now()) / 86400) * 86400)), 0)
$$;

grant execute on all functions in schema tests to anon, authenticated;

select tests.create_user('aaaaaaaa-0000-0000-0000-000000000001');
select tests.create_user('aaaaaaaa-0000-0000-0000-000000000002');
select tests.create_user('bbbbbbbb-0000-0000-0000-000000000001');
select tests.create_user('cccccccc-0000-0000-0000-000000000001');

insert into public.families (id) values
  ('aaaaaaaa-f000-0000-0000-000000000000'),
  ('bbbbbbbb-f000-0000-0000-000000000000');
insert into public.family_members (family_id, user_id) values
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-f000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002'),
  ('bbbbbbbb-f000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000001');

-- Whatever earlier local runs left in today's global row doesn't matter to these tests.
delete from public.usage_counters where scope = 'global';

select plan(22);

-- ---- per user (api_usage, 'chat_day') --------------------------------------
select is(tests.budget('aaaaaaaa-0000-0000-0000-000000000001', 2, 100, 1000, 10), 'ok', 'user A1: turn 1 ok');
select is(tests.budget('aaaaaaaa-0000-0000-0000-000000000001', 2, 100, 1000, 10), 'ok', 'user A1: turn 2 ok');
select is(tests.budget('aaaaaaaa-0000-0000-0000-000000000001', 2, 100, 1000, 10), 'user',
  'user A1: turn 3 is over the daily per-user cap');
select is(
  (select count from public.api_usage where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
     and function = 'chat_day'),
  3, 'the per-user count lives in api_usage under chat_day (one UTC-day window)');
select is(tests.family_turns('aaaaaaaa-f000-0000-0000-000000000000'), 2::bigint,
  'a turn refused by the user cap does not count against the family');
select is(tests.global_spend(), 20::bigint, 'a turn refused by the user cap reserves nothing globally');

-- ---- per family (usage_counters, scope family) ------------------------------
select is(tests.budget('aaaaaaaa-0000-0000-0000-000000000002', 10, 3, 1000, 10), 'ok',
  'partner A2: the family has one turn left');
select is(tests.budget('aaaaaaaa-0000-0000-0000-000000000002', 10, 3, 1000, 10), 'family',
  'partner A2: over the daily per-family cap, shared by both parents (the attempt still counts)');
select is(tests.global_spend(), 30::bigint, 'a turn refused by the family cap reserves nothing globally');
select is(tests.budget('bbbbbbbb-0000-0000-0000-000000000001', 10, 3, 1000, 10), 'ok',
  'another family has its own count');
select is(tests.budget('cccccccc-0000-0000-0000-000000000001', 10, 3, 1000, 10), 'family',
  'a user with no family is refused (fails closed)');

-- ---- global spend: reserve, refuse, settle ---------------------------------
-- Spend is now 40 of 1000. A reservation that doesn't fit is refused and adds nothing.
select is(tests.budget('bbbbbbbb-0000-0000-0000-000000000001', 10, 100, 1000, 961), 'global',
  'a reservation past the global budget is refused');
select is(tests.global_spend(), 40::bigint, 'a refused reservation adds nothing');
select is(tests.budget('bbbbbbbb-0000-0000-0000-000000000001', 10, 100, 1000, 960), 'ok',
  'a reservation that exactly fits is accepted');
select is(tests.global_spend(), 1000::bigint, 'the budget is full');
select is(tests.budget('bbbbbbbb-0000-0000-0000-000000000001', 10, 100, 1000, 1), 'global',
  'with the budget full, every turn is refused');

select lives_ok(
  $$select public.settle_chat_spend(to_timestamp(floor(extract(epoch from now()) / 86400) * 86400), 960, 25)$$,
  'settling replaces the reservation with the metered cost');
select is(tests.global_spend(), 65::bigint, 'after settling, the refund is available again');
select throws_ok(
  $$select tests.budget('bbbbbbbb-0000-0000-0000-000000000001', 10, 100, 1000, -5)$$,
  '22023', 'invalid_reserve', 'a negative reservation is rejected');

-- ---- clients ----------------------------------------------------------------
select tests.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select is(
  (select array_agg(scope || ':' || count order by scope) from public.usage_counters),
  array['family:4'],
  'a parent sees only their own family''s turn count, not the global row or other families');
select throws_ok(
  $$update public.usage_counters set count = 0$$,
  '42501', null, 'clients cannot reset the counters');
select throws_ok(
  $$select public.consume_chat_budget('aaaaaaaa-0000-0000-0000-000000000001', 1000, 1000, 1000000, 0)$$,
  '42501', null, 'clients cannot call consume_chat_budget');

select * from finish();
rollback;
